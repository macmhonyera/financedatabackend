import { IsNumber, IsString, IsOptional, IsObject, Matches, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsString()
  loanId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({ required: false, description: 'Storage key of an optional receipt photo (uploaded via /storage/upload-url)' })
  @IsOptional()
  @IsString()
  receiptImageKey?: string;

  @ApiProperty({
    required: false,
    description: 'Receipt photo as a base64 data URL (e.g. handwritten or printed receipt photographed by the officer).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(jpe?g|png|webp);base64,/, {
    message: 'receiptDataUrl must be an image data URL',
  })
  receiptDataUrl?: string;
}
