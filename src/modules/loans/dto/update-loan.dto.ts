import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RepaymentFrequency } from '../../../entities/loan-product.entity';

export class UpdateLoanDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  termMonths?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRateAnnual?: number;

  @ApiProperty({ required: false, enum: ['weekly', 'biweekly', 'monthly'] })
  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly'])
  repaymentFrequency?: RepaymentFrequency;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isCollateralized?: boolean;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collateralAssetIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  collateralNotes?: string;
}
