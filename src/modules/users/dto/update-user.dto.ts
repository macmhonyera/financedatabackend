import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { USER_ROLES, UserRoleDto } from './create-user.dto';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: UserRoleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: 'New password (>= 8 characters)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
