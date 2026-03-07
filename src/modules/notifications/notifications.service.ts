import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { NotificationTemplate } from '../../entities/notification-template.entity';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { EnqueueNotificationDto } from './dto/enqueue-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    @InjectRepository(NotificationTemplate) private templateRepo: Repository<NotificationTemplate>,
    private mail: MailService,
    private sms: SmsService,
  ) {}

  private render(template: string, payload?: Record<string, any>) {
    if (!template) return template;
    const p = payload || {};
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
      const path = key.split('.');
      let value: any = p;
      for (const segment of path) {
        value = value?.[segment];
      }
      return value === undefined || value === null ? '' : String(value);
    });
  }

  async createTemplate(dto: CreateNotificationTemplateDto) {
    const entity = this.templateRepo.create({
      ...dto,
      isActive: dto.isActive ?? true,
    } as any);
    return this.templateRepo.save(entity);
  }

  listTemplates(includeInactive = true) {
    if (includeInactive) return this.templateRepo.find({ order: { createdAt: 'DESC' } });
    return this.templateRepo.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
  }

  async updateTemplate(id: string, dto: UpdateNotificationTemplateDto) {
    const existing = await this.templateRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Template not found');
    await this.templateRepo.update(id, dto as any);
    return this.templateRepo.findOne({ where: { id } });
  }

  async enqueue(dto: EnqueueNotificationDto) {
    let template: NotificationTemplate | null = null;
    if (dto.templateCode) {
      template = await this.templateRepo.findOne({ where: { code: dto.templateCode } });
      if (!template || !template.isActive) {
        throw new NotFoundException('Active template not found for templateCode');
      }
    }

    const channel = dto.channel || template?.channel;
    if (!channel) throw new BadRequestException('channel is required when templateCode is not provided');

    const subject = dto.subject ?? (template?.subjectTemplate ? this.render(template.subjectTemplate, dto.payload) : undefined);
    const message = dto.message ?? (template?.bodyTemplate ? this.render(template.bodyTemplate, dto.payload) : undefined);

    if (!message) throw new BadRequestException('message is required when template body is not available');

    const entity = this.repo.create({
      template: template ? ({ id: template.id } as any) : undefined,
      channel,
      recipientId: dto.recipientId,
      recipientAddress: dto.recipientAddress,
      subject,
      message,
      payload: dto.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: Number(dto.maxAttempts || 3),
    } as any);

    return this.repo.save(entity);
  }

  listNotifications(filters: { status?: string; recipientId?: string; channel?: string }) {
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.template', 'template')
      .orderBy('n.createdAt', 'DESC');

    if (filters.status) qb.andWhere('n.status = :status', { status: filters.status });
    if (filters.recipientId) qb.andWhere('n.recipientId = :recipientId', { recipientId: filters.recipientId });
    if (filters.channel) qb.andWhere('n.channel = :channel', { channel: filters.channel });

    return qb.getMany();
  }

  getMyInApp(user: any) {
    return this.repo.find({
      where: {
        recipientId: user?.id,
        channel: 'in_app',
      } as any,
      order: { createdAt: 'DESC' },
    });
  }

  async getMyInAppUnreadCount(user: any) {
    const unread = await this.repo.count({
      where: {
        recipientId: user?.id,
        channel: 'in_app',
        isRead: false,
      } as any,
    });

    return { unread };
  }

  async markMyInAppNotificationRead(id: string, user: any) {
    const notification = await this.repo.findOne({
      where: {
        id,
        recipientId: user?.id,
        channel: 'in_app',
      } as any,
      relations: ['template'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.repo.save(notification);
    }

    return notification;
  }

  async markAllMyInAppRead(user: any) {
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({
        isRead: true,
        readAt: () => 'CURRENT_TIMESTAMP',
      } as any)
      .where('recipientId = :recipientId', { recipientId: user?.id })
      .andWhere('channel = :channel', { channel: 'in_app' })
      .andWhere('(isRead = false OR isRead IS NULL)')
      .execute();

    return { updated: Number(result.affected || 0) };
  }

  private async dispatch(notification: Notification) {
    if (notification.channel === 'in_app') {
      return {
        providerMessageId: `in-app-${notification.id}`,
      };
    }

    if (notification.channel === 'email') {
      return this.mail.send({
        to: notification.recipientAddress,
        subject: notification.subject,
        body: notification.message,
      });
    }

    if (notification.channel === 'sms') {
      return this.sms.send({
        to: notification.recipientAddress,
        body: notification.message,
      });
    }

    throw new Error(`Unsupported notification channel: ${notification.channel}`);
  }

  async processPending(limit = 50) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 50)));
    const now = new Date();

    const pending = await this.repo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.template', 'template')
      .where('(n.status = :pending OR n.status = :failed)', { pending: 'pending', failed: 'failed' })
      .andWhere('n.attempts < n.maxAttempts')
      .andWhere('(n.nextRetryAt IS NULL OR n.nextRetryAt <= :now)', { now: now.toISOString() })
      .orderBy('n.createdAt', 'ASC')
      .take(safeLimit)
      .getMany();

    const summary = {
      processed: 0,
      sent: 0,
      failed: 0,
      ids: [] as string[],
    };

    for (const row of pending) {
      summary.processed += 1;
      summary.ids.push(row.id);

      try {
        const resp = await this.dispatch(row);
        row.attempts += 1;
        row.status = 'sent';
        row.providerMessageId = String((resp as any)?.providerMessageId || `msg-${Date.now()}`);
        row.lastError = null as any;
        row.nextRetryAt = null as any;
        row.sentAt = new Date();
        await this.repo.save(row);
        summary.sent += 1;
      } catch (err: any) {
        row.attempts += 1;
        row.status = 'failed';
        row.lastError = String(err?.message || err);

        if (row.attempts < row.maxAttempts) {
          const retryMinutes = Math.pow(2, row.attempts);
          const nextRetryAt = new Date();
          nextRetryAt.setMinutes(nextRetryAt.getMinutes() + retryMinutes);
          row.nextRetryAt = nextRetryAt;
        } else {
          row.nextRetryAt = null as any;
        }

        await this.repo.save(row);
        summary.failed += 1;
      }
    }

    return summary;
  }
}
