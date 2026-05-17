import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const WORKING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const LATE_FEE_MODELS = ['flat', 'percent_of_installment', 'percent_of_balance'] as const;

class WorkingHoursDto {
  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'start must be HH:mm' })
  start?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'end must be HH:mm' })
  end?: string;
}

class GeneralDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  defaultCurrency?: string;

  @ApiPropertyOptional({ enum: WORKING_DAYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(WORKING_DAYS as unknown as string[], { each: true })
  workingDays?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;

  @ApiPropertyOptional({ example: 'Africa/Harare' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;
}

class PenaltiesDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  gracePeriodDays?: number;

  @ApiPropertyOptional({ enum: LATE_FEE_MODELS })
  @IsOptional()
  @IsIn(LATE_FEE_MODELS as unknown as string[])
  lateFeeModel?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeeAmount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lateFeePercent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  penaltyInterestAnnualPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  capLateFeesAtInstallment?: boolean;
}

class ApprovalDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  autoApproveUnder?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  managerApprovalUnder?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  directorApprovalAbove?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireDualApproval?: boolean;
}

class ProvisioningDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  par1to30Percent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  par31to60Percent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  par61to90Percent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  par90PlusPercent?: number;
}

class NotificationChannelsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

class NotificationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels?: NotificationChannelsDto;

  @ApiPropertyOptional({ description: 'Days before due date to send reminders, e.g. [3,1]' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  reminderDaysBeforeDue?: number[];

  @ApiPropertyOptional({ minimum: 1, maximum: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  overdueReminderCadenceDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiRecoveryEnabled?: boolean;
}

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneralDto)
  general?: GeneralDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => PenaltiesDto)
  penalties?: PenaltiesDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovalDto)
  approval?: ApprovalDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisioningDto)
  provisioning?: ProvisioningDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsDto)
  notifications?: NotificationsDto;

  @ApiPropertyOptional({ description: 'ISO date strings (YYYY-MM-DD) for non-working holidays' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'holidays must be YYYY-MM-DD' })
  holidays?: string[];
}
