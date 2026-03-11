import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

const DATA_URL_PATTERN = /^data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+$/;

export class UploadClientProfilePhotoDto {
  @ApiProperty({
    description: 'Profile photo as a base64 data URL',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  @IsString()
  @Matches(DATA_URL_PATTERN, {
    message: 'profile photo must be a valid base64 data URL',
  })
  @MaxLength(1_500_000)
  dataUrl: string;
}
