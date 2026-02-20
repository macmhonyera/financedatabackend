import { Controller, Get, Post, Body, Query, UseGuards, Req, Param } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List payments (scoped to user branch)' })
  @ApiResponse({ status: 200, description: 'List of payments' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Req() req: any, @Query('loanId') loanId?: string) {
    if (loanId) return this.svc.findByLoanScoped(loanId, req.user);
    return this.svc.findAllScoped(req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer', 'collector')
  @Post()
  @ApiOperation({ summary: 'Record a payment' })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Req() req: any, @Body() body: CreatePaymentDto) {
    return this.svc.create(
      {
        amount: body.amount,
        loan: { id: body.loanId } as any,
        client: body.clientId ? ({ id: body.clientId } as any) : undefined,
        branch: body.branch,
        idempotencyKey: body.idempotencyKey,
        externalReference: body.externalReference,
        channel: body.channel,
        metadata: body.metadata,
      } as any,
      req.user,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Post(':id/reconcile')
  @ApiOperation({ summary: 'Mark payment as reconciled (admin/manager)' })
  reconcile(@Req() req: any, @Param('id') id: string, @Body() body: { status?: 'reconciled' | 'disputed' }) {
    return this.svc.reconcilePayment(id, body?.status || 'reconciled', req.user);
  }
}
