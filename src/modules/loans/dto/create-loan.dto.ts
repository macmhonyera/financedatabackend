import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RepaymentFrequency } from '../../../entities/loan-product.entity';

export class CreateLoanDto {
  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  termMonths?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  interestRateAnnual?: number;

  @ApiProperty({ required: false, enum: ['weekly', 'biweekly', 'monthly'] })
  @IsOptional()
  repaymentFrequency?: RepaymentFrequency;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false, description: 'Optional disbursement date (ISO string)' })
  @IsOptional()
  @IsString()
  disbursedAt?: string;
}
