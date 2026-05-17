import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { Branch } from '../../entities/branch.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    @InjectRepository(Branch) private branchRepo: Repository<Branch>,
  ) {}

  findByEmail(email: string) {
    return this.repo.findOne({
      where: { email: email.toLowerCase() },
      relations: ['branch', 'organization'],
    });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['branch', 'organization'] });
  }

  all() {
    return this.repo.find({
      relations: ['branch', 'organization'],
      order: { name: 'ASC' },
    });
  }

  create(user: Partial<User>) {
    const e = this.repo.create(user as any);
    return this.repo.save(e);
  }

  sanitize(user: User | null | undefined) {
    if (!user) return null;
    const { passwordHash, ...rest } = user as any;
    return rest;
  }

  async createWithPlainPassword(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException(`A user with email "${email}" already exists`);
    }

    if (dto.role !== 'admin' && !dto.branchId) {
      throw new BadRequestException(`Branch is required for the "${dto.role}" role`);
    }

    let branch: Branch | undefined;
    if (dto.branchId) {
      const found = await this.branchRepo.findOne({ where: { id: dto.branchId } });
      if (!found) throw new BadRequestException(`Branch "${dto.branchId}" not found`);
      branch = found;
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.repo.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      role: dto.role,
      phone: dto.phone?.trim() || undefined,
      branch: branch ?? undefined,
      active: dto.active ?? true,
    });
    const saved = await this.repo.save(user);
    return this.findById(saved.id) as Promise<User>;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.active !== undefined) user.active = dto.active;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.phone !== undefined) user.phone = dto.phone.trim() || undefined;

    if (dto.branchId !== undefined) {
      if (dto.branchId === null || dto.branchId === '') {
        user.branch = undefined;
      } else {
        const branch = await this.branchRepo.findOne({ where: { id: dto.branchId } });
        if (!branch) throw new BadRequestException(`Branch "${dto.branchId}" not found`);
        user.branch = branch;
      }
    }

    if (user.role !== 'admin' && !user.branch) {
      throw new BadRequestException(`Branch is required for the "${user.role}" role`);
    }

    await this.repo.save(user);
    return this.findById(id);
  }

  async setPassword(id: string, plain: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
    await this.repo.save(user);
    return { ok: true };
  }

  async setActive(id: string, active: boolean) {
    return this.update(id, { active });
  }
}
