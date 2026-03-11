import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType: ClientDocumentType;

  @ApiPropertyOptional({ description: 'Original document filename' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  documentName?: string;

  @ApiProperty({
    description: 'Document file as base64 data URL (image or PDF)',
    example: 'data:application/pdf;base64,JVBERi0xLjcKJ...',
  })
  @IsString()
  @Matches(DATA_URL_PATTERN, {
    message: 'document must be a valid base64 data URL',
  })
  @MaxLength(8_000_000)
  dataUrl: string;

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
