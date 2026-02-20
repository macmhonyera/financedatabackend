import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';

@Injectable()
export class ClientsService {
  constructor(@InjectRepository(Client) private repo: Repository<Client>) {}

  create(data: Partial<Client>) {
    const e = this.repo.create(data as any);
    return this.repo.save(e);
  }

  findAll() {
    return this.repo.find({ relations: ['branch', 'loans'] });
  }

  // Return clients scoped to user: admins get all, branch users get only their branch
  findAllScoped(user: any) {
    if (!user || user.role === 'admin') return this.findAll();
    return this.repo.find({ where: { branch: { id: user.branch } as any }, relations: ['branch', 'loans'] });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['branch', 'loans'] });
  }

  async findByIdScoped(id: string, user: any) {
    const client = await this.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    if (user?.role === 'admin') return client;

    const clientBranchId = (client.branch as any)?.id;
    if (!user?.branch || clientBranchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to access this client');
    }
    return client;
  }

  async update(id: string, updates: Partial<Client>) {
    await this.repo.update(id, updates as any);
    return this.findById(id);
  }

  async updateScoped(id: string, updates: Partial<Client>, user: any) {
    await this.findByIdScoped(id, user);
    await this.repo.update(id, updates as any);
    return this.findById(id);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}
