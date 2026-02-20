import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class ProcessNotificationsDto {
  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
