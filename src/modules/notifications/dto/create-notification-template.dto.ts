import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { NotificationChannel } from '../../../entities/notification-template.entity';

export class CreateNotificationTemplateDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ enum: ['in_app', 'email', 'sms'] })
  channel: NotificationChannel;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @ApiProperty()
  @IsString()
  bodyTemplate: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
