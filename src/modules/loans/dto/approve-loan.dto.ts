import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveLoanDto {
  @ApiProperty({ required: false, description: 'Optional disbursement date (ISO string)' })
  @IsOptional()
  @IsString()
  disbursedAt?: string;
}
