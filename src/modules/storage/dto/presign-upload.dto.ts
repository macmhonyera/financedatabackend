import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { StorageScope } from '../../../common/storage/storage.types';

const SCOPES: StorageScope[] = [
  'client-documents',
  'client-photos',
  'payment-receipts',
  'loan-signatures',
  'field-visits',
];

export class PresignUploadDto {
  @ApiProperty({ enum: SCOPES })
  @IsIn(SCOPES)
  scope: StorageScope;

  @ApiProperty({ description: 'MIME type of the file you intend to upload' })
  @IsString()
  contentType: string;

  @ApiProperty({ description: 'Size in bytes (used for capacity checks)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  sizeBytes: number;

  @ApiProperty({ required: false, description: 'Original filename, used for extension hint' })
  @IsOptional()
  @IsString()
  suggestedFilename?: string;
}
