import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ description: 'Short stable branch code', example: 'BR003' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'id must be alphanumeric (with - or _)' })
  id: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: 'Free-text manager name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  manager?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
