import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(LoanInstallment) private installmentRepo: Repository<LoanInstallment>,
    private notifications: NotificationsService,
  ) {}

  private round2(value: number) {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  private allocation(due: number, paid: number, remaining: number) {
    const dueLeft = this.round2(Math.max(0, due - paid));
    const chunk = this.round2(Math.min(dueLeft, remaining));
    return { chunk, dueLeft };
  }

  async create(data: Partial<Payment>, user?: any) {
    const amount = Number(data.amount || 0);
    if (!amount || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    const loanId = (data.loan as any)?.id;
    if (!loanId) {
      throw new BadRequestException('loanId is required');
    }

    const idempotencyKey = (data as any).idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = await this.repo.findOne({
        where: { idempotencyKey } as any,
        relations: ['loan', 'client', 'client.branch'],
      });
      if (existing) {
        const branchId = ((existing.client as any)?.branch as any)?.id || existing.branch;
        if (user?.role !== 'admin' && user?.branch && branchId && branchId !== user.branch) {
          throw new ForbiddenException('Payment exists for another branch scope');
        }
        return existing;
      }
    }

    const paymentResult = await this.repo.manager.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const localLoanRepo = manager.getRepository(Loan);
      const localInstallmentRepo = manager.getRepository(LoanInstallment);

      const loan = await localLoanRepo.findOne({
        where: { id: loanId },
        relations: ['client', 'client.branch'],
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const loanBranchId = ((loan.client as any)?.branch as any)?.id;
      if (user?.role !== 'admin' && user?.branch && loanBranchId && loanBranchId !== user.branch) {
        throw new ForbiddenException('You are not allowed to post payment for this loan');
      }

      const branchId = loanBranchId || (data as any).branch || user?.branch;
      const payment = paymentRepo.create({
        amount,
        loan: { id: loanId } as any,
        client: (loan.client as any)?.id ? ({ id: (loan.client as any).id } as any) : undefined,
        branch: branchId,
        idempotencyKey: idempotencyKey || undefined,
        externalReference: (data as any).externalReference,
        channel: (data as any).channel,
        metadata: (data as any).metadata,
        reconciliationStatus: 'pending',
      } as any);
      const saved = await paymentRepo.save(payment as any);

      let remaining = amount;
      const installments = await localInstallmentRepo.find({
        where: { loan: { id: loanId } as any },
        order: { installmentNumber: 'ASC' },
      });

      for (const row of installments) {
        if (remaining <= 0) break;

        let step = this.allocation(Number(row.penaltyDue || 0), Number(row.penaltyPaid || 0), remaining);
        row.penaltyPaid = this.round2(Number(row.penaltyPaid || 0) + step.chunk) as any;
        remaining = this.round2(remaining - step.chunk);

        if (remaining > 0) {
          step = this.allocation(Number(row.feeDue || 0), Number(row.feePaid || 0), remaining);
          row.feePaid = this.round2(Number(row.feePaid || 0) + step.chunk) as any;
          remaining = this.round2(remaining - step.chunk);
        }

        if (remaining > 0) {
          step = this.allocation(Number(row.interestDue || 0), Number(row.interestPaid || 0), remaining);
          row.interestPaid = this.round2(Number(row.interestPaid || 0) + step.chunk) as any;
          remaining = this.round2(remaining - step.chunk);
        }

        if (remaining > 0) {
          step = this.allocation(Number(row.principalDue || 0), Number(row.principalPaid || 0), remaining);
          row.principalPaid = this.round2(Number(row.principalPaid || 0) + step.chunk) as any;
          remaining = this.round2(remaining - step.chunk);
        }

        const rowDue =
          Number(row.penaltyDue || 0) +
          Number(row.feeDue || 0) +
          Number(row.interestDue || 0) +
          Number(row.principalDue || 0);
        const rowPaid =
          Number(row.penaltyPaid || 0) +
          Number(row.feePaid || 0) +
          Number(row.interestPaid || 0) +
          Number(row.principalPaid || 0);

        if (this.round2(rowPaid) >= this.round2(rowDue)) {
          row.status = 'paid';
          row.paidAt = new Date();
        } else if (rowPaid > 0) {
          row.status = 'partial';
        }
      }

      if (installments.length > 0) {
        await localInstallmentRepo.save(installments as any);
      }

      const now = new Date();
      const hasOverdue = installments.some((row) => row.status !== 'paid' && new Date(`${row.dueDate}T23:59:59.999Z`) < now);

      const currentBalance = Number(loan.balance || 0);
      const nextBalance = this.round2(Math.max(0, currentBalance - amount));
      loan.balance = nextBalance as any;
      if (nextBalance <= 0) {
        loan.status = 'completed';
      } else if (hasOverdue) {
        loan.status = 'overdue';
      } else if (loan.status === 'pending') {
        loan.status = 'active';
      }
      await localLoanRepo.save(loan);

      return paymentRepo.findOne({ where: { id: (saved as any).id }, relations: ['loan', 'client'] });
    });

    try {
      const phone = (paymentResult as any)?.client?.phone;
      if (phone) {
        await this.notifications.enqueue({
          channel: 'sms',
          recipientId: (paymentResult as any)?.client?.id,
          recipientAddress: phone,
          message: `Payment received: ${amount.toFixed(2)} on loan ${(paymentResult as any)?.loan?.id}.`,
          payload: {
            loanId: (paymentResult as any)?.loan?.id,
            amount: amount.toFixed(2),
          },
        } as any);
      }
    } catch (_err) {
      // Non-blocking notification failure; payment posting remains successful.
    }

    return paymentResult;
  }

  findAll() {
    return this.repo.find({ relations: ['loan', 'client', 'client.branch'] });
  }

  findByLoan(loanId: string) {
    return this.repo.find({
      where: { loan: { id: loanId } as any },
      relations: ['loan', 'client', 'client.branch'],
    });
  }

  findByLoanScoped(loanId: string, user: any) {
    if (!user || user.role === 'admin') return this.findByLoan(loanId);
    return this.repo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .leftJoinAndSelect('payment.loan', 'loan')
      .where('loan.id = :loanId', { loanId })
      .andWhere('payment.branch = :branchId', { branchId: user.branch })
      .getMany();
  }

  findAllScoped(user: any) {
    if (!user || user.role === 'admin') return this.findAll();
    return this.repo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .leftJoinAndSelect('payment.loan', 'loan')
      .where('payment.branch = :branchId', { branchId: user.branch })
      .getMany();
  }

  async reconcilePayment(id: string, status: 'reconciled' | 'disputed', user: any) {
    const payment = await this.repo.findOne({
      where: { id },
      relations: ['client', 'client.branch', 'loan'],
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const branchId = ((payment.client as any)?.branch as any)?.id || payment.branch;
    if (user?.role !== 'admin' && user?.branch && branchId && branchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to reconcile this payment');
    }

    payment.reconciliationStatus = status as any;
    payment.reconciledAt = status === 'reconciled' ? new Date() : null as any;
    return this.repo.save(payment);
  }
}
