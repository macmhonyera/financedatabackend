import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoanProduct } from '../../entities/loan-product.entity';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { UpdateLoanProductDto } from './dto/update-loan-product.dto';

@Injectable()
export class LoanProductsService {
  constructor(@InjectRepository(LoanProduct) private repo: Repository<LoanProduct>) {}

  async create(dto: CreateLoanProductDto) {
    if (Number(dto.minAmount) > Number(dto.maxAmount)) {
      throw new BadRequestException('minAmount cannot be greater than maxAmount');
    }
    const entity = this.repo.create({
      ...dto,
      currency: dto.currency || 'USD',
      repaymentFrequency: dto.repaymentFrequency || 'monthly',
      scheduleType: dto.scheduleType || 'reducing',
      interestRateAnnual: Number(dto.interestRateAnnual || 0),
      processingFeeRate: Number(dto.processingFeeRate || 0),
      lateFeeRate: Number(dto.lateFeeRate || 0),
      gracePeriodDays: Number(dto.gracePeriodDays || 0),
      isActive: dto.isActive ?? true,
    } as any);
    return this.repo.save(entity);
  }

  findAll(includeInactive = true) {
    if (includeInactive) return this.repo.find({ order: { createdAt: 'DESC' } });
    return this.repo.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
  }

  async findById(id: string) {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Loan product not found');
    return product;
  }

  async findByCode(code: string) {
    const product = await this.repo.findOne({ where: { code } });
    if (!product) throw new NotFoundException('Loan product not found');
    return product;
  }

  async update(id: string, dto: UpdateLoanProductDto) {
    await this.findById(id);

    if (dto.minAmount !== undefined && dto.maxAmount !== undefined && Number(dto.minAmount) > Number(dto.maxAmount)) {
      throw new BadRequestException('minAmount cannot be greater than maxAmount');
    }

    await this.repo.update(id, dto as any);
    return this.findById(id);
  }

  async deactivate(id: string) {
    await this.findById(id);
    await this.repo.update(id, { isActive: false } as any);
    return this.findById(id);
  }
}
