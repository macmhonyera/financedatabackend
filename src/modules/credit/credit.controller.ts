import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreditService } from './credit.service';

class ScoreDto {
  @IsOptional()
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsNumber()
  balance: number;

  @IsOptional()
  @IsNumber()
  paid_total?: number;

  @IsOptional()
  @IsNumber()
  num_payments?: number;

  @IsOptional()
  @IsNumber()
  age_days?: number;

  @IsOptional()
  @IsNumber()
  client_tenure_days?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  clientId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  loanId?: string;
}

@ApiTags('credit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'manager', 'loan_officer')
@Controller('credit')
export class CreditController {
  constructor(private readonly svc: CreditService) {}

  @Post('score')
  @ApiOperation({ summary: 'Legacy scoring endpoint (backward compatible)' })
  @ApiResponse({ status: 201, description: 'Application scored' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async score(@Req() req: any, @Body() dto: ScoreDto) {
    const { clientId, loanId, ...rest } = dto as any;
    return this.svc.scoreApplication(rest, clientId, loanId, req.user);
  }

  @Get('history')
  @ApiOperation({ summary: 'List credit score history (legacy endpoint)' })
  @ApiResponse({ status: 200, description: 'List of credit scores' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async history(@Req() req: any) {
    return this.svc.findAll(req.user);
  }

  @Get('model-health')
  @ApiOperation({ summary: 'Model scoring health summary' })
  @ApiResponse({ status: 200, description: 'Scoring health metrics' })
  async modelHealth(@Req() req: any) {
    return this.svc.modelHealth(req.user);
  }
}
