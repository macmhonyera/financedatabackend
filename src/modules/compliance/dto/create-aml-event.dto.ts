import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { AmlSeverity, AmlStatus } from '../../../entities/aml-event.entity';

export class CreateAmlEventDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty()
  @IsString()
  eventType: string;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'], required: false })
  @IsOptional()
  severity?: AmlSeverity;

  @ApiProperty({ enum: ['open', 'under_review', 'reported', 'closed'], required: false })
  @IsOptional()
  status?: AmlStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}
