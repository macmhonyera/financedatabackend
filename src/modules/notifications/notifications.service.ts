import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import { Notification } from '../../entities/notification.entity';
import { NotificationTemplate } from '../../entities/notification-template.entity';
import { User } from '../../entities/user.entity';
import { Client } from '../../entities/client.entity';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { EnqueueNotificationDto } from './dto/enqueue-notification.dto';
import { MessageEvent, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly streamSubjectsByUser = new Map<string, Set<Subject<MessageEvent>>>();

  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    @InjectRepository(NotificationTemplate) private templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    private mail: MailService,
    private sms: SmsService,
    private jwt: JwtService,
  ) {}

  private async attachRecipientNames(rows: Notification[]) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    const recipientIds = Array.from(
      new Set(
        rows
          .map((row) => String(row?.recipientId || '').trim())
          .filter((value) => value.length > 0),
      ),
    );

    const [users, clients] =
      recipientIds.length > 0
        ? await Promise.all([
            this.userRepo.find({
              where: { id: In(recipientIds) } as any,
              select: ['id', 'name'],
            }),
            this.clientRepo.find({
              where: { id: In(recipientIds) } as any,
              select: ['id', 'name'],
            }),
          ])
        : [[], []];

    const userNameById = new Map(users.map((user) => [String(user.id), String(user.name || '').trim()]));
    const clientNameById = new Map(clients.map((client) => [String(client.id), String(client.name || '').trim()]));

    return rows.map((row) => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const payloadNames = [
        payload?.recipientName,
        payload?.clientName,
        payload?.borrowerName,
        payload?.userName,
      ]
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0);

      const recipientId = String(row?.recipientId || '').trim();
      const recipientName =
        payloadNames[0] ||
        userNameById.get(recipientId) ||
        clientNameById.get(recipientId) ||
        undefined;

      return {
        ...(row as any),
        recipientName,
      };
    });
  }

  private getOrCreateStreamSubjects(userId: string) {
    const existing = this.streamSubjectsByUser.get(userId);
    if (existing) return existing;

    const created = new Set<Subject<MessageEvent>>();
    this.streamSubjectsByUser.set(userId, created);
    return created;
  }

  private broadcastToUser(userId: string, payload: Record<string, any>) {
    if (!userId) return;
    const streams = this.streamSubjectsByUser.get(userId);
    if (!streams || streams.size === 0) return;

    const event: MessageEvent = {
      type: 'notification',
      data: {
        ...payload,
        at: new Date().toISOString(),
      },
    };

    for (const subject of streams) {
      subject.next(event);
    }
  }

  private async emitUnreadCount(userId?: string) {
    const recipientId = String(userId || '').trim();
    if (!recipientId) return;

    const unread = await this.repo.count({
      where: {
        recipientId,
        channel: 'in_app',
        isRead: false,
      } as any,
    });

    this.broadcastToUser(recipientId, {
      type: 'unread_count',
      unread,
    });
  }

  resolveStreamUser(req: any, queryToken?: string) {
    const authHeader = String(req?.headers?.authorization || '').trim();
    const headerToken =
      authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const token = String(queryToken || headerToken || '').trim();

    if (!token) {
      throw new UnauthorizedException('Missing stream token');
    }

    try {
      const payload = this.jwt.verify(token) as any;
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid stream token payload');
      }

      return {
        id: String(payload.sub),
        email: payload.email,
        role: payload.role,
        branch: payload.branch,
      };
    } catch (_err) {
      throw new UnauthorizedException('Invalid stream token');
    }
  }

  subscribeToMyNotificationStream(userId: string): Observable<MessageEvent> {
    const recipientId = String(userId || '').trim();
    if (!recipientId) {
      throw new UnauthorizedException('Invalid stream user');
    }

    return new Observable<MessageEvent>((subscriber) => {
      const subject = new Subject<MessageEvent>();
      const subjects = this.getOrCreateStreamSubjects(recipientId);
      subjects.add(subject);

      const subscription = subject.subscribe(subscriber);
      const heartbeatInterval = setInterval(() => {
        subject.next({
          type: 'heartbeat',
          data: {
            type: 'heartbeat',
            at: new Date().toISOString(),
          },
        });
      }, 25000);

      subject.next({
        type: 'connected',
        data: {
          type: 'connected',
          at: new Date().toISOString(),
        },
      });

      this.emitUnreadCount(recipientId).catch(() => undefined);

      return () => {
        clearInterval(heartbeatInterval);
        subscription.unsubscribe();
        subjects.delete(subject);
        subject.complete();

        if (subjects.size === 0) {
          this.streamSubjectsByUser.delete(recipientId);
        }
      };
    });
  }

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

    const savedResult = await this.repo.save(entity as any);
    const saved = Array.isArray(savedResult) ? savedResult[0] : savedResult;

    if (saved.channel === 'in_app' && saved.recipientId) {
      this.broadcastToUser(saved.recipientId, {
        type: 'notification',
        notificationId: saved.id,
      });
      this.emitUnreadCount(saved.recipientId).catch(() => undefined);
    }

    return (await this.attachRecipientNames([saved]))[0];
  }

  async listNotifications(filters: { status?: string; recipientId?: string; channel?: string }) {
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.template', 'template')
      .orderBy('n.createdAt', 'DESC');

    if (filters.status) qb.andWhere('n.status = :status', { status: filters.status });
    if (filters.recipientId) qb.andWhere('n.recipientId = :recipientId', { recipientId: filters.recipientId });
    if (filters.channel) qb.andWhere('n.channel = :channel', { channel: filters.channel });

    const rows = await qb.getMany();
    return this.attachRecipientNames(rows);
  }

  async getMyInApp(user: any) {
    const rows = await this.repo.find({
      where: {
        recipientId: user?.id,
        channel: 'in_app',
      } as any,
      order: { createdAt: 'DESC' },
    });
    return this.attachRecipientNames(rows);
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

    this.emitUnreadCount(String(user?.id || '')).catch(() => undefined);

    return (await this.attachRecipientNames([notification]))[0];
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

    this.emitUnreadCount(String(user?.id || '')).catch(() => undefined);

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
