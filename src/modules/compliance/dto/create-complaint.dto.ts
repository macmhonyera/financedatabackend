import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ComplaintChannel } from '../../../entities/complaint.entity';

export class CreateComplaintDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({ enum: ['in_app', 'sms', 'email', 'phone', 'walk_in'], required: false })
  @IsOptional()
  channel?: ComplaintChannel;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}
