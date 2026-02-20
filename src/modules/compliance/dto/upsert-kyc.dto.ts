import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { CddStatus, RiskRating } from '../../../entities/kyc-profile.entity';

export class UpsertKycDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiProperty({ required: false, description: 'Date string in YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  physicalAddress?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  monthlyIncome?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  businessSector?: string;

  @ApiProperty({ required: false, enum: ['pending', 'approved', 'rejected'] })
  @IsOptional()
  cddStatus?: CddStatus;

  @ApiProperty({ required: false, enum: ['low', 'medium', 'high'] })
  @IsOptional()
  riskRating?: RiskRating;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  pep?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  sanctionsHit?: boolean;
}
