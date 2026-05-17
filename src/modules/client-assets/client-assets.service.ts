import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';
import { ClientAsset } from '../../entities/client-asset.entity';
import { CreateClientAssetDto } from './dto/create-client-asset.dto';
import { UpdateClientAssetDto } from './dto/update-client-asset.dto';

@Injectable()
export class ClientAssetsService {
  constructor(
    @InjectRepository(ClientAsset) private readonly assetRepo: Repository<ClientAsset>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
  ) {}

  private normalizeDate(value?: string): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('valuationDate must be a valid date string');
    }
    return d.toISOString().slice(0, 10);
  }

  private async getScopedClient(clientId: string, user: any): Promise<Client> {
    const client = await this.clientRepo.findOne({ where: { id: clientId }, relations: ['branch'] });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (user?.role !== 'admin') {
      const clientBranchId = (client.branch as any)?.id;
      if (!user?.branch || !clientBranchId || user.branch !== clientBranchId) {
        throw new ForbiddenException('You are not allowed to access assets for this client');
      }
    }

    return client;
  }

  async listForClient(clientId: string, user: any, includeInactive = true) {
    await this.getScopedClient(clientId, user);

    if (includeInactive) {
      return this.assetRepo.find({ where: { clientId }, order: { createdAt: 'DESC' } });
    }

    return this.assetRepo.find({ where: { clientId, status: 'active' }, order: { createdAt: 'DESC' } });
  }

  private validatePhotoSize(photoDataUrl: string | undefined): void {
    if (!photoDataUrl) return;
    // base64 ~ 4/3 of the binary; cap raw at ~3MB after decode
    const base64Part = photoDataUrl.split(',')[1] || '';
    const approxBytes = Math.floor(base64Part.length * 0.75);
    if (approxBytes > 3 * 1024 * 1024) {
      throw new BadRequestException('Asset photo is too large. Please use an image under 3MB.');
    }
  }

  async createForClient(clientId: string, dto: CreateClientAssetDto, user: any) {
    await this.getScopedClient(clientId, user);

    // Idempotent replay: if an asset with the same idempotencyKey already exists for
    // this client (set in description metadata), return it. We store the key in `notes`
    // tail to avoid an extra column for now since the existing schema has no key column.
    if (dto.idempotencyKey) {
      const tag = `__key:${dto.idempotencyKey}`;
      const existing = await this.assetRepo.findOne({
        where: { clientId, notes: tag } as any,
      });
      if (existing) return existing;
    }

    this.validatePhotoSize(dto.photoDataUrl);

    const officerName =
      (user?.name as string | undefined) || (user?.email as string | undefined) || undefined;

    const entity = this.assetRepo.create({
      clientId,
      client: { id: clientId } as any,
      assetType: dto.assetType,
      description: dto.description,
      marketValue: dto.marketValue,
      valuationDate: this.normalizeDate(dto.valuationDate),
      status: dto.status || 'active',
      notes: dto.idempotencyKey
        ? `${dto.notes ? dto.notes + '\n' : ''}__key:${dto.idempotencyKey}`
        : dto.notes,
      photoDataUrl: dto.photoDataUrl,
      photoCapturedBy: dto.photoDataUrl ? officerName : undefined,
      photoCapturedAt: dto.photoDataUrl ? new Date() : undefined,
    } as Partial<ClientAsset>);

    return this.assetRepo.save(entity);
  }

  async updateForClient(clientId: string, assetId: string, dto: UpdateClientAssetDto, user: any) {
    await this.getScopedClient(clientId, user);

    const existing = await this.assetRepo.findOne({ where: { id: assetId, clientId } });
    if (!existing) {
      throw new NotFoundException('Client asset not found');
    }

    if (dto.valuationDate !== undefined) {
      existing.valuationDate = this.normalizeDate(dto.valuationDate);
    }

    if (dto.assetType !== undefined) existing.assetType = dto.assetType;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.marketValue !== undefined) existing.marketValue = dto.marketValue;
    if (dto.status !== undefined) existing.status = dto.status;
    if (dto.notes !== undefined) existing.notes = dto.notes;

    if (dto.photoDataUrl !== undefined) {
      this.validatePhotoSize(dto.photoDataUrl);
      const officerName =
        (user?.name as string | undefined) || (user?.email as string | undefined) || undefined;
      existing.photoDataUrl = dto.photoDataUrl || undefined;
      existing.photoCapturedBy = dto.photoDataUrl ? officerName : undefined;
      existing.photoCapturedAt = dto.photoDataUrl ? new Date() : undefined;
    }

    return this.assetRepo.save(existing);
  }
}
