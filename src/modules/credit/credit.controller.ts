import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { CreditService } from './credit.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

class ScoreDto {
  amount: number;
  balance: number;
  paid_total?: number;
  num_payments?: number;
  age_days?: number;
  client_tenure_days?: number;
  clientId?: string;
  loanId?: string;
}

@ApiTags('credit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('credit')
export class CreditController {
  constructor(private svc: CreditService) {}

  @Post('score')
  @ApiOperation({ summary: 'Score a single application' })
  @ApiResponse({ status: 201, description: 'Application scored' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 503, description: 'Credit scoring service unavailable' })
  async score(@Body() dto: ScoreDto) {
    const { clientId, loanId, ...rest } = dto as any;
    return this.svc.scoreApplication(rest, clientId, loanId);
  }

  @Get('history')
  @ApiOperation({ summary: 'List credit score history' })
  @ApiResponse({ status: 200, description: 'List of credit scores' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async history() {
    return this.svc.findAll();
  }

  @Get('model-health')
  @ApiOperation({ summary: 'Model scoring health summary' })
  @ApiResponse({ status: 200, description: 'Scoring health metrics' })
  async modelHealth() {
    return this.svc.modelHealth();
  }
}
