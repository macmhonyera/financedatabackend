import { IsString, IsOptional, IsEmail, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateClientDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  loanOfficer?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @ApiProperty({ required: false, enum: ['active', 'inactive', 'defaulted'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'defaulted'])
  status?: 'active' | 'inactive' | 'defaulted';

  @ApiProperty({ required: false, enum: ['current', 'overdue', 'defaulted'] })
  @IsOptional()
  @IsIn(['current', 'overdue', 'defaulted'])
  collectionStatus?: 'current' | 'overdue' | 'defaulted';

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  creditScore?: number;
}
