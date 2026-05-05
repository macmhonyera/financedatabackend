import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldVisit } from '../../entities/field-visit.entity';
import { Client } from '../../entities/client.entity';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';

type AuthUser = { id: string; name?: string; role: string; branch?: string | null };

@Injectable()
export class FieldVisitsService {
  constructor(
    @InjectRepository(FieldVisit) private readonly repo: Repository<FieldVisit>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
  ) {}

  async create(dto: CreateFieldVisitDto, user: AuthUser) {
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = await this.repo.findOne({ where: { idempotencyKey } as any });
      if (existing) return existing;
    }

    const client = await this.clientRepo.findOne({
      where: { id: dto.clientId },
      relations: ['branch'],
    });
    if (!client) throw new NotFoundException('Client not found');

    const branchId = (client.branch as any)?.id;
    if (user.role !== 'admin' && user.branch && branchId && branchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to record a visit for this client');
    }

    const captured = new Date(dto.capturedAt);
    if (Number.isNaN(captured.getTime())) {
      throw new ForbiddenException('capturedAt must be a valid timestamp');
    }

    const entity = this.repo.create({
      idempotencyKey: idempotencyKey || undefined,
      client: { id: dto.clientId } as any,
      officerUserId: user.id,
      officerName: user.name,
      latitude: dto.latitude,
      longitude: dto.longitude,
      capturedAt: captured,
      notes: dto.notes?.trim() || undefined,
      photoStorageKey: dto.photoStorageKey,
    });
    return this.repo.save(entity);
  }

  async listForClient(clientId: string, user: AuthUser) {
    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      relations: ['branch'],
    });
    if (!client) throw new NotFoundException('Client not found');

    const branchId = (client.branch as any)?.id;
    if (user.role !== 'admin' && user.branch && branchId && branchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to view visits for this client');
    }

    return this.repo.find({
      where: { client: { id: clientId } as any },
      order: { capturedAt: 'DESC' },
      take: 200,
    });
  }

  async listMine(user: AuthUser, limit = 200) {
    return this.repo.find({
      where: { officerUserId: user.id },
      order: { capturedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
