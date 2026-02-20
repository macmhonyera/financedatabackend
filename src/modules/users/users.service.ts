import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email }, relations: ['branch'] });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['branch'] });
  }

  create(user: Partial<User>) {
    const e = this.repo.create(user as any);
    return this.repo.save(e);
  }

  async all() {
    return this.repo.find({ relations: ['branch'] });
  }
}
