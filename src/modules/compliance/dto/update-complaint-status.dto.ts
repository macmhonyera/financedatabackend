import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ComplaintStatus } from '../../../entities/complaint.entity';

export class UpdateComplaintStatusDto {
  @ApiProperty({ enum: ['open', 'in_review', 'resolved', 'rejected'] })
  status: ComplaintStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  resolutionSummary?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}
