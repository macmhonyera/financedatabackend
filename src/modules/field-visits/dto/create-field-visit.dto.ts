import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateFieldVisitDto {
  @ApiPropertyOptional({ description: 'Optional client-supplied key to deduplicate retries from offline mobile clients.' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty({ description: 'When the visit took place (ISO timestamp)' })
  @IsDateString()
  capturedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Storage key for an optional photo of the visit' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  photoStorageKey?: string;
}
