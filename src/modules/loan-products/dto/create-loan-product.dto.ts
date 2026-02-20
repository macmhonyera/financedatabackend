import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RepaymentFrequency, ScheduleType } from '../../../entities/loan-product.entity';

export class CreateLoanProductDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  minAmount: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  maxAmount: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  termMonths: number;

  @ApiProperty({ enum: ['weekly', 'biweekly', 'monthly'], default: 'monthly' })
  @IsOptional()
  repaymentFrequency?: RepaymentFrequency;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  interestRateAnnual?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  processingFeeRate?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeeRate?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gracePeriodDays?: number;

  @ApiProperty({ enum: ['flat', 'reducing'], default: 'reducing', required: false })
  @IsOptional()
  scheduleType?: ScheduleType;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
