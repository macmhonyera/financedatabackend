import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../../entities/branch.entity';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(@InjectRepository(Branch) private readonly repo: Repository<Branch>) {}

  listActive() {
    return this.repo.find({ where: { active: true }, order: { name: 'ASC' } });
  }

  listAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async listScoped(user: any) {
    if (!user || user.role === 'admin') {
      return this.listAll();
    }
    if (!user.branch) return [];
    const branch = await this.repo.findOne({ where: { id: user.branch } });
    return branch ? [branch] : [];
  }

  async findOne(id: string) {
    const branch = await this.repo.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(dto: CreateBranchDto) {
    const id = dto.id.trim();
    const name = dto.name.trim();
    if (!id || !name) throw new BadRequestException('id and name are required');

    const existing = await this.repo.findOne({ where: { id } });
    if (existing) throw new ConflictException(`Branch with id "${id}" already exists`);

    const entity = this.repo.create({
      id,
      name,
      address: dto.address?.trim() || undefined,
      phone: dto.phone?.trim() || undefined,
      manager: dto.manager?.trim() || undefined,
      active: dto.active ?? true,
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateBranchDto) {
    const branch = await this.findOne(id);
    if (dto.name !== undefined) branch.name = dto.name.trim();
    if (dto.address !== undefined) branch.address = dto.address.trim() || undefined;
    if (dto.phone !== undefined) branch.phone = dto.phone.trim() || undefined;
    if (dto.manager !== undefined) branch.manager = dto.manager.trim() || undefined;
    if (dto.active !== undefined) branch.active = dto.active;
    return this.repo.save(branch);
  }

  async deactivate(id: string) {
    return this.update(id, { active: false });
  }
}
