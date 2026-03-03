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

  async createForClient(clientId: string, dto: CreateClientAssetDto, user: any) {
    await this.getScopedClient(clientId, user);

    const entity = this.assetRepo.create({
      clientId,
      client: { id: clientId } as any,
      assetType: dto.assetType,
      description: dto.description,
      marketValue: dto.marketValue,
      valuationDate: this.normalizeDate(dto.valuationDate),
      status: dto.status || 'active',
      notes: dto.notes,
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

    return this.assetRepo.save(existing);
  }
}
