import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../../entities/branch.entity';

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
}
