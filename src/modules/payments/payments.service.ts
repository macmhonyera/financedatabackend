import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly channelFallback = [
    'cash',
    'bank_transfer',
    'mobile_money',
    'ecocash',
    'onemoney',
    'zipit',
    'rtgs',
    'card',
    'cheque',
    'other',
  ];

  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(LoanInstallment) private installmentRepo: Repository<LoanInstallment>,
    private notifications: NotificationsService,
  ) {}

  private round2(value: number) {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  private getAllowedChannels() {
    const parsed = String(process.env.PAYMENT_CHANNELS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);

    return new Set(parsed.length > 0 ? parsed : this.channelFallback);
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

    const rawChannel = String((data as any).channel || '').trim().toLowerCase();
    const allowedChannels = this.getAllowedChannels();
    if (rawChannel && !allowedChannels.has(rawChannel)) {
      throw new BadRequestException(
        `Unsupported payment channel. Allowed: ${Array.from(allowedChannels).join(', ')}`,
      );
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
      if (!['active', 'overdue'].includes(String(loan.status))) {
        throw new BadRequestException('Payments can only be posted to active or overdue loans');
      }

      const loanBranchId = ((loan.client as any)?.branch as any)?.id;
      if (user?.role !== 'admin' && user?.branch && loanBranchId && loanBranchId !== user.branch) {
        throw new ForbiddenException('You are not allowed to post payment for this loan');
      }

      const currentBalance = Number(loan.balance || 0);
      if (currentBalance <= 0) {
        throw new BadRequestException('Loan has no outstanding balance');
      }
      if (amount > currentBalance + 0.01) {
        throw new BadRequestException('Payment amount cannot exceed outstanding loan balance');
      }

      const branchId = loanBranchId || (data as any).branch || user?.branch;
      const isInstantlyReconciled = rawChannel === 'cash';
      const receiptDataUrl = (data as any).receiptDataUrl as string | undefined;
      if (receiptDataUrl) {
        const base64Part = receiptDataUrl.split(',')[1] || '';
        const approxBytes = Math.floor(base64Part.length * 0.75);
        if (approxBytes > 3 * 1024 * 1024) {
          throw new BadRequestException(
            'Receipt photo is too large. Please use an image under 3MB.',
          );
        }
      }
      const officerName =
        (user?.name as string | undefined) || (user?.email as string | undefined) || undefined;
      const officerId = (user?.id as string | undefined) || undefined;

      const payment = paymentRepo.create({
        amount,
        loan: { id: loanId } as any,
        client: (loan.client as any)?.id ? ({ id: (loan.client as any).id } as any) : undefined,
        branch: branchId,
        idempotencyKey: idempotencyKey || undefined,
        externalReference: (data as any).externalReference,
        channel: rawChannel || undefined,
        metadata: (data as any).metadata,
        receiptImageKey: (data as any).receiptImageKey || undefined,
        receiptDataUrl,
        receiptNumber: this.buildReceiptNumber(),
        issuedByUserId: officerId,
        issuedByName: officerName,
        reconciliationStatus: isInstantlyReconciled ? 'reconciled' : 'pending',
        reconciledAt: isInstantlyReconciled ? new Date() : undefined,
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

      const nextBalance = this.round2(Math.max(0, currentBalance - amount));
      loan.balance = nextBalance as any;
      if (nextBalance <= 0) {
        loan.status = 'completed';
      } else if (hasOverdue) {
        loan.status = 'overdue';
      } else {
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

  private buildReceiptNumber(): string {
    const now = new Date();
    const yyyymmdd =
      now.getUTCFullYear().toString() +
      String(now.getUTCMonth() + 1).padStart(2, '0') +
      String(now.getUTCDate()).padStart(2, '0');
    // Random 6-char A-Z0-9 segment for uniqueness within the day
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return `RCT-${yyyymmdd}-${suffix}`;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async renderReceipt(id: string, user: any): Promise<string> {
    const payment = await this.repo.findOne({
      where: { id },
      relations: ['client', 'client.branch', 'loan'],
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const branchId = ((payment.client as any)?.branch as any)?.id || payment.branch;
    if (user?.role !== 'admin' && user?.branch && branchId && branchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to view this payment');
    }

    const esc = (v: string | undefined | null) => this.escapeHtml(String(v ?? '—'));
    const amountFmt = Number(payment.amount).toFixed(2);
    const branchName =
      ((payment.client as any)?.branch as any)?.name || payment.branch || 'Branch';
    const clientName = (payment.client as any)?.name || '—';
    const loanIdShort = ((payment.loan as any)?.id || '').slice(0, 8);
    const issuedAt = (payment.createdAt instanceof Date
      ? payment.createdAt
      : new Date(payment.createdAt)
    ).toLocaleString('en-GB');
    const channel = payment.channel
      ? payment.channel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : '—';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(payment.receiptNumber)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;margin:0;color:#111827}
  .wrap{max-width:560px;margin:24px auto;padding:24px;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#6b7280;font-size:12px}
  .num{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f9fafb;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;display:inline-block;font-size:13px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}
  .row:last-child{border-bottom:0}
  .label{color:#6b7280}
  .value{color:#111827;font-weight:500}
  .total{margin-top:12px;padding:12px;border-radius:6px;background:#f0fdf4;border:1px solid #bbf7d0;text-align:right}
  .total .lbl{font-size:11px;color:#16a34a;letter-spacing:.06em;text-transform:uppercase}
  .total .amt{font-size:28px;font-weight:700;color:#166534}
  .signoff{margin-top:24px;display:flex;justify-content:space-between;font-size:12px;color:#374151}
  .signoff .name{font-weight:600;color:#111827}
  .actions{margin-top:16px;text-align:center}
  .actions button{background:#1e3a8a;color:#fff;border:0;padding:10px 18px;border-radius:6px;font-weight:600;cursor:pointer}
  @media print {.actions{display:none} body{background:#fff} .wrap{box-shadow:none;margin:0}}
</style>
</head>
<body>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
    <div>
      <h1>Payment receipt</h1>
      <p class="muted">${esc(branchName)} · ${esc(issuedAt)}</p>
    </div>
    <span class="num">${esc(payment.receiptNumber)}</span>
  </div>

  <div class="row"><span class="label">Client</span><span class="value">${esc(clientName)}</span></div>
  <div class="row"><span class="label">Loan</span><span class="value">#${esc(loanIdShort)}</span></div>
  <div class="row"><span class="label">Channel</span><span class="value">${esc(channel)}</span></div>
  ${payment.externalReference ? `<div class="row"><span class="label">Reference</span><span class="value">${esc(payment.externalReference)}</span></div>` : ''}
  <div class="row"><span class="label">Status</span><span class="value">${esc(payment.reconciliationStatus)}</span></div>

  <div class="total">
    <div class="lbl">Amount paid</div>
    <div class="amt">$${esc(amountFmt)}</div>
  </div>

  <div class="signoff">
    <div>
      <div class="muted">Issued by</div>
      <div class="name">${esc(payment.issuedByName)}</div>
    </div>
    <div style="text-align:right">
      <div class="muted">Receipt no.</div>
      <div class="name">${esc(payment.receiptNumber)}</div>
    </div>
  </div>

  ${payment.receiptDataUrl
    ? `<div style="margin-top:18px"><div class="muted" style="margin-bottom:6px">Receipt photo</div><img src="${esc(payment.receiptDataUrl)}" alt="Receipt" style="max-width:100%;border-radius:6px;border:1px solid #e5e7eb"/></div>`
    : ''}

  <div class="actions">
    <button onclick="window.print()">Print receipt</button>
  </div>
</div>
</body>
</html>`;
  }
}
