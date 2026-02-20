import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { NotificationChannel } from '../../../entities/notification-template.entity';

export class EnqueueNotificationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  templateCode?: string;

  @ApiProperty({ required: false, enum: ['in_app', 'email', 'sms'] })
  @IsOptional()
  channel?: NotificationChannel;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recipientId?: string;

  @ApiProperty({ description: 'Email address, phone number, or in-app address key' })
  @IsString()
  recipientAddress: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiProperty({ required: false, default: 3 })
  @IsOptional()
  @IsNumber()
  maxAttempts?: number;
}
