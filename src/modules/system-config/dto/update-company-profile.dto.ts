import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const RGB_TRIPLET_PATTERN = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/;

export class UpdateCompanyProfileDto {
  @ApiPropertyOptional({ description: 'Organization display name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Primary RGB triplet (space-separated)' })
  @IsOptional()
  @IsString()
  @Matches(RGB_TRIPLET_PATTERN, {
    message: 'primary must be an RGB triplet like "30 58 138"',
  })
  primary?: string;

  @ApiPropertyOptional({ description: 'Accent RGB triplet (space-separated)' })
  @IsOptional()
  @IsString()
  @Matches(RGB_TRIPLET_PATTERN, {
    message: 'accent must be an RGB triplet like "20 184 166"',
  })
  accent?: string;

  @ApiPropertyOptional({ description: 'Logo URL or data URL', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300000)
  logo?: string;
}
