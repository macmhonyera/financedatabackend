import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientDocumentType } from '../../../entities/client.entity';

const DATA_URL_PATTERN = /^data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+$/;

const DOCUMENT_TYPES: ClientDocumentType[] = [
  'national_id',
  'shop_license',
  'car_registration',
  'title_deed',
  'other',
];

export class UploadClientDocumentDto {
  @ApiPropertyOptional({ description: 'Optional client-supplied key to deduplicate retries from offline mobile clients.' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType: ClientDocumentType;

  @ApiPropertyOptional({ description: 'Original document filename' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  documentName?: string;

  @ApiPropertyOptional({
    description: 'Legacy: full document as base64 data URL. Prefer `storageKey` after presigned upload.',
    example: 'data:application/pdf;base64,JVBERi0xLjcKJ...',
  })
  @ValidateIf((o) => !o.storageKey)
  @IsString()
  @Matches(DATA_URL_PATTERN, { message: 'document must be a valid base64 data URL' })
  @MaxLength(8_000_000)
  dataUrl?: string;

  @ApiPropertyOptional({ description: 'Storage key returned from POST /storage/upload-url after the file has been PUT to the upload URL.' })
  @ValidateIf((o) => !o.dataUrl)
  @IsString()
  @MaxLength(255)
  storageKey?: string;

  @ApiPropertyOptional({ description: 'MIME type of the uploaded file (required when using storageKey)' })
  @ValidateIf((o) => !!o.storageKey)
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Size in bytes of the uploaded file (required when using storageKey)' })
  @ValidateIf((o) => !!o.storageKey)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes?: number;

  @ApiPropertyOptional({ description: 'Document number if available' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date (if document expires)' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}
