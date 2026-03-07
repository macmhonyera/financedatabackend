import { Controller, Get, Post, Body, Param, Put, UseGuards, Req, Query } from '@nestjs/common';
import { LoansService } from './loans.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { ApproveLoanDto } from './dto/approve-loan.dto';
import { RejectLoanDto } from './dto/reject-loan.dto';

@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('loans')
export class LoansController {
  constructor(private svc: LoansService) {}

  @Get()
  @ApiOperation({ summary: 'List all loans (scoped to user branch)' })
  @ApiResponse({ status: 200, description: 'List of loans' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Req() req: any) {
    return this.svc.findAllScoped(req.user);
  }

  @Get('portfolio/summary')
  @ApiOperation({ summary: 'Portfolio summary and PAR buckets' })
  @ApiResponse({ status: 200, description: 'Portfolio metrics' })
  portfolioSummary(@Req() req: any) {
    return this.svc.portfolioSummary(req.user);
  }

  @Get('collections/due-today')
  @ApiOperation({ summary: 'Collections schedule due on a date (defaults to today)' })
  @ApiResponse({ status: 200, description: 'Due installments for collections dashboard' })
  collectionsDueToday(@Req() req: any, @Query('date') date?: string) {
    return this.svc.collectionsDueTodayScoped(req.user, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan by ID' })
  @ApiResponse({ status: 200, description: 'Loan found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.svc.findByIdScoped(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer')
  @Post()
  @ApiOperation({ summary: 'Create loan (admin/manager/loan_officer)' })
  @ApiBody({ type: CreateLoanDto })
  @ApiResponse({ status: 201, description: 'Loan created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Req() req: any, @Body() body: CreateLoanDto) {
    return this.svc.create(
      {
        amount: body.amount,
        balance: body.amount,
        client: { id: body.clientId } as any,
        productId: body.productId,
        termMonths: body.termMonths,
        interestRateAnnual: body.interestRateAnnual,
        repaymentFrequency: body.repaymentFrequency,
        currency: body.currency,
        isCollateralized: body.isCollateralized,
        collateralAssetIds: body.collateralAssetIds,
        collateralNotes: body.collateralNotes,
      } as any,
      req.user,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Put(':id')
  @ApiOperation({ summary: 'Update loan (admin/manager)' })
  @ApiBody({ type: UpdateLoanDto })
  @ApiResponse({ status: 200, description: 'Loan updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateLoanDto) {
    return this.svc.updateScoped(id, body as any, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve loan (admin only)' })
  @ApiResponse({ status: 200, description: 'Loan approved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  approve(@Req() req: any, @Param('id') id: string, @Body() body: ApproveLoanDto) {
    return this.svc.setStatusScoped(id, 'active', req.user, {
      disbursedAt: body?.disbursedAt,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject loan (admin only)' })
  @ApiResponse({ status: 200, description: 'Loan rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  reject(@Req() req: any, @Param('id') id: string, @Body() body: RejectLoanDto) {
    return this.svc.setStatusScoped(id, 'rejected', req.user, {
      reason: body?.reason,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Post(':id/rebuild-schedule')
  @ApiOperation({ summary: 'Rebuild loan repayment schedule from loan terms (admin/manager)' })
  @ApiResponse({ status: 200, description: 'Loan schedule rebuilt' })
  rebuildSchedule(@Req() req: any, @Param('id') id: string) {
    return this.svc.rebuildScheduleScoped(id, req.user);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get repayment schedule for loan' })
  @ApiResponse({ status: 200, description: 'Loan schedule' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSchedule(@Req() req: any, @Param('id') id: string) {
    return this.svc.listScheduleScoped(id, req.user);
  }
}
