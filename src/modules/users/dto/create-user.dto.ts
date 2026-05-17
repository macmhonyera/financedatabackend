import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const USER_ROLES = ['admin', 'manager', 'loan_officer', 'collector'] as const;
export type UserRoleDto = (typeof USER_ROLES)[number];

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Initial password (>= 8 characters)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES as unknown as string[])
  role: UserRoleDto;

  @ApiPropertyOptional({ description: 'Branch id (required for non-admin roles)' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Contact phone, e.g. +263 77 111 2222' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
