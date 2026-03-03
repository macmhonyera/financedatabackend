import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ComputeCreditScoreDto } from './dto/compute-credit-score.dto';
import { ScoringService } from './scoring.service';

@ApiTags('credit-score')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'manager', 'loan_officer')
@Controller('credit-score')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  @Post('compute')
  @ApiOperation({ summary: 'Compute and store a credit score for a client' })
  @ApiResponse({ status: 201, description: 'Credit score computed' })
  compute(@Req() req: any, @Body() dto: ComputeCreditScoreDto) {
    return this.scoring.computeForClient(dto.clientId, req.user, { loanId: dto.loanId });
  }

  @Get(':clientId/latest')
  @ApiOperation({ summary: 'Get latest credit score for a client' })
  @ApiResponse({ status: 200, description: 'Latest score' })
  latest(@Req() req: any, @Param('clientId') clientId: string) {
    return this.scoring.getLatestForClient(clientId, req.user);
  }

  @Get(':clientId/history')
  @ApiOperation({ summary: 'Get credit score history for a client' })
  @ApiResponse({ status: 200, description: 'Score history' })
  history(@Req() req: any, @Param('clientId') clientId: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.scoring.getHistoryForClient(clientId, req.user, parsedLimit);
  }
}
