import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateClientAssetDto {
  @ApiProperty({ example: 'vehicle' })
  @IsString()
  @MaxLength(100)
  assetType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 8500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  marketValue: number;

  @ApiProperty({ required: false, example: '2026-02-28' })
  @IsOptional()
  @IsString()
  valuationDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, enum: ['active', 'inactive', 'disposed'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'disposed'])
  status?: 'active' | 'inactive' | 'disposed';
}
