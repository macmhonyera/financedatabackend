import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Loan } from '../../entities/loan.entity';
import { Client } from '../../entities/client.entity';
import { ClientAsset } from '../../entities/client-asset.entity';
import { CreditService } from '../credit/credit.service';
import { LoanProduct, RepaymentFrequency, ScheduleType } from '../../entities/loan-product.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Payment } from '../../entities/payment.entity';

type LoanCreateInput = Partial<Loan> & {
  productId?: string;
  termMonths?: number;
  interestRateAnnual?: number;
  repaymentFrequency?: RepaymentFrequency;
  currency?: string;
  isCollateralized?: boolean;
  collateralAssetIds?: string[];
  collateralNotes?: string;
};

type LoanUpdateInput = LoanCreateInput;

type CollateralResolution = {
  collateralTotalMarketValue?: number;
  collateralSnapshot?: Record<string, any>;
};

type LoanTerms = {
  interestRateAnnual: number;
  termMonths: number;
  repaymentFrequency: RepaymentFrequency;
  currency: string;
};

type OutstandingInstallmentCandidate = {
  loan: Loan;
  installment?: LoanInstallment;
  outstanding: number;
  source: 'installment' | 'loan_balance';
};

type ClientLoanGate = {
  pendingApplications: Loan[];
  outstandingInstallments: OutstandingInstallmentCandidate[];
};

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectRepository(Loan) private repo: Repository<Loan>,
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    @InjectRepository(ClientAsset) private clientAssetRepo: Repository<ClientAsset>,
    @InjectRepository(LoanProduct) private productRepo: Repository<LoanProduct>,
    @InjectRepository(LoanInstallment) private installmentRepo: Repository<LoanInstallment>,
    private credit: CreditService,
    private notifications: NotificationsService,
  ) {}

  private round2(value: number) {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  private toDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private parseIsoDateOrThrow(value: string | Date | undefined, fieldName: string): Date {
    const parsed = value ? new Date(value) : new Date();
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }
    return parsed;
  }

  private addPeriod(baseDate: Date, periodNo: number, repaymentFrequency: RepaymentFrequency) {
    const d = new Date(baseDate);
    if (repaymentFrequency === 'weekly') {
      d.setDate(d.getDate() + periodNo * 7);
      return d;
    }
    if (repaymentFrequency === 'biweekly') {
      d.setDate(d.getDate() + periodNo * 14);
      return d;
    }
    d.setMonth(d.getMonth() + periodNo);
    return d;
  }

  private periodsForTerm(termMonths: number, repaymentFrequency: RepaymentFrequency) {
    if (repaymentFrequency === 'weekly') return Math.max(1, Math.ceil((termMonths * 52) / 12));
    if (repaymentFrequency === 'biweekly') return Math.max(1, Math.ceil((termMonths * 26) / 12));
    return Math.max(1, termMonths);
  }

  private periodsPerYear(repaymentFrequency: RepaymentFrequency) {
    if (repaymentFrequency === 'weekly') return 52;
    if (repaymentFrequency === 'biweekly') return 26;
    return 12;
  }

  private allocation(due: number, paid: number, remaining: number) {
    const dueLeft = this.round2(Math.max(0, due - paid));
    const chunk = this.round2(Math.min(dueLeft, remaining));
    return { chunk, dueLeft };
  }

  private installmentOutstanding(row: LoanInstallment) {
    const due =
      Number(row.principalDue || 0) +
      Number(row.interestDue || 0) +
      Number(row.feeDue || 0) +
      Number(row.penaltyDue || 0);
    const paid =
      Number(row.principalPaid || 0) +
      Number(row.interestPaid || 0) +
      Number(row.feePaid || 0) +
      Number(row.penaltyPaid || 0);
    return this.round2(Math.max(0, due - paid));
  }

  private async evaluateClientLoanGate(args: {
    clientId: string;
    excludeLoanId?: string;
    manager?: EntityManager;
  }): Promise<ClientLoanGate> {
    const { clientId, excludeLoanId, manager } = args;
    const loanRepo = manager ? manager.getRepository(Loan) : this.repo;

    const qb = loanRepo
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .leftJoinAndSelect('loan.installments', 'installment')
      .where('client.id = :clientId', { clientId })
      .andWhere('loan.status IN (:...statuses)', {
        statuses: ['pending', 'active', 'overdue', 'defaulted'],
      })
      .orderBy('loan.createdAt', 'ASC')
      .addOrderBy('installment.installmentNumber', 'ASC');

    if (excludeLoanId) {
      qb.andWhere('loan.id != :excludeLoanId', { excludeLoanId });
    }

    const loans = await qb.getMany();
    const pendingApplications = loans.filter((loan) => loan.status === 'pending');
    const outstandingInstallments: OutstandingInstallmentCandidate[] = [];

    for (const loan of loans) {
      if (!['active', 'overdue', 'defaulted'].includes(loan.status)) continue;

      const installments = Array.isArray(loan.installments) ? loan.installments : [];
      if (installments.length === 0) {
        const loanBalance = this.round2(Number(loan.balance || 0));
        if (loanBalance > 0) {
          outstandingInstallments.push({
            loan,
            outstanding: loanBalance,
            source: 'loan_balance',
          });
        }
        continue;
      }

      for (const installment of installments) {
        const outstanding = this.installmentOutstanding(installment);
        if (outstanding <= 0) continue;

        outstandingInstallments.push({
          loan,
          installment,
          outstanding,
          source: 'installment',
        });
      }
    }

    outstandingInstallments.sort((a, b) => {
      const leftDate = a.installment?.dueDate || '9999-12-31';
      const rightDate = b.installment?.dueDate || '9999-12-31';
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

      const leftNumber = Number(a.installment?.installmentNumber || 999999);
      const rightNumber = Number(b.installment?.installmentNumber || 999999);
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;

      return String(a.loan.id || '').localeCompare(String(b.loan.id || ''));
    });

    return {
      pendingApplications,
      outstandingInstallments,
    };
  }

  private async settleRolloverInstallment(args: {
    manager: EntityManager;
    newLoan: Loan;
    candidate: OutstandingInstallmentCandidate;
    actor?: any;
  }) {
    const { manager, newLoan, candidate, actor } = args;
    if (candidate.source !== 'installment' || !candidate.installment) {
      throw new BadRequestException(
        'Cannot process rollover deduction because existing loan schedule is incomplete',
      );
    }

    const loanRepo = manager.getRepository(Loan);
    const installmentRepo = manager.getRepository(LoanInstallment);
    const paymentRepo = manager.getRepository(Payment);

    const priorLoan = await loanRepo.findOne({
      where: { id: candidate.loan.id },
      relations: ['client', 'client.branch', 'installments'],
    });
    if (!priorLoan) {
      throw new BadRequestException('Rollover source loan was not found');
    }
    if (!['active', 'overdue', 'defaulted'].includes(priorLoan.status)) {
      return { deductedAmount: 0, settledLoanId: priorLoan.id };
    }

    const installmentRows = [...(priorLoan.installments || [])].sort(
      (a, b) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0),
    );

    const targetInstallment = installmentRows.find((row) => row.id === candidate.installment?.id);
    if (!targetInstallment) {
      throw new BadRequestException('Rollover source installment was not found');
    }

    const targetOutstanding = this.installmentOutstanding(targetInstallment);
    const maxLoanBalance = this.round2(Number(priorLoan.balance || 0));
    const deductionAmount = this.round2(Math.min(targetOutstanding, maxLoanBalance));
    if (deductionAmount <= 0) {
      return { deductedAmount: 0, settledLoanId: priorLoan.id };
    }

    const branchId = ((priorLoan.client as any)?.branch as any)?.id;
    const payment = paymentRepo.create({
      amount: deductionAmount,
      loan: { id: priorLoan.id } as any,
      client: (priorLoan.client as any)?.id ? ({ id: (priorLoan.client as any).id } as any) : undefined,
      branch: branchId || undefined,
      channel: 'other',
      reconciliationStatus: 'reconciled',
      reconciledAt: new Date(),
      externalReference: `ROLLOVER-${newLoan.id.slice(0, 8).toUpperCase()}-${Date.now()}`,
      metadata: {
        type: 'rollover_settlement',
        sourceLoanId: newLoan.id,
        sourceInstallmentId: targetInstallment.id,
        createdByUserId: actor?.id || null,
      },
    } as any);
    await paymentRepo.save(payment as any);

    let remaining = deductionAmount;
    for (const row of installmentRows) {
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

      const rowOutstanding = this.installmentOutstanding(row);
      if (rowOutstanding <= 0) {
        row.status = 'paid';
        row.paidAt = new Date();
      } else if (rowOutstanding < Number(row.totalDue || 0)) {
        row.status = 'partial';
      } else {
        row.status = 'pending';
      }
    }

    await installmentRepo.save(installmentRows as any);

    const appliedAmount = this.round2(deductionAmount - remaining);
    const now = new Date();
    const hasOverdue = installmentRows.some(
      (row) => this.installmentOutstanding(row) > 0 && new Date(`${row.dueDate}T23:59:59.999Z`) < now,
    );
    const nextBalance = this.round2(Math.max(0, Number(priorLoan.balance || 0) - appliedAmount));

    priorLoan.balance = nextBalance as any;
    if (nextBalance <= 0) {
      priorLoan.status = 'completed';
    } else if (hasOverdue) {
      priorLoan.status = 'overdue';
    } else {
      priorLoan.status = 'active';
    }
    await loanRepo.save(priorLoan);

    return {
      deductedAmount: appliedAmount,
      settledLoanId: priorLoan.id,
      settledInstallmentId: targetInstallment.id,
    };
  }

  private normalizeTerms(input: {
    termMonths?: number;
    interestRateAnnual?: number;
    repaymentFrequency?: RepaymentFrequency;
    currency?: string;
    product?: LoanProduct;
    existing?: Loan;
    preferProductDefaults?: boolean;
  }): LoanTerms {
    const { product, existing } = input;

    const interestRateAnnual = Number(
      input.interestRateAnnual ??
        (input.preferProductDefaults ? product?.interestRateAnnual : undefined) ??
        existing?.interestRateAnnual ??
        product?.interestRateAnnual ??
        0,
    );
    if (!Number.isFinite(interestRateAnnual) || interestRateAnnual < 0) {
      throw new BadRequestException('interestRateAnnual must be greater than or equal to 0');
    }

    const termMonths = Number(
      input.termMonths ??
        (input.preferProductDefaults ? product?.termMonths : undefined) ??
        existing?.termMonths ??
        product?.termMonths ??
        1,
    );
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 360) {
      throw new BadRequestException('termMonths must be an integer between 1 and 360');
    }

    const repaymentFrequency =
      (input.repaymentFrequency as RepaymentFrequency) ||
      ((input.preferProductDefaults ? product?.repaymentFrequency : undefined) as RepaymentFrequency) ||
      (existing?.repaymentFrequency as RepaymentFrequency) ||
      (product?.repaymentFrequency as RepaymentFrequency) ||
      'monthly';

    if (!['weekly', 'biweekly', 'monthly'].includes(repaymentFrequency)) {
      throw new BadRequestException('repaymentFrequency must be one of weekly, biweekly, or monthly');
    }

    const currency = String(
      input.currency ??
        (input.preferProductDefaults ? product?.currency : undefined) ??
        existing?.currency ??
        product?.currency ??
        'USD',
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('currency must be an ISO 4217 3-letter code');
    }

    return { interestRateAnnual, termMonths, repaymentFrequency, currency };
  }

  private buildRepaymentSchedule(args: {
    loanId: string;
    principal: number;
    interestRateAnnual: number;
    termMonths: number;
    repaymentFrequency: RepaymentFrequency;
    scheduleType: ScheduleType;
    disbursedAt: Date;
    processingFee: number;
  }) {
    const {
      loanId,
      principal,
      interestRateAnnual,
      termMonths,
      repaymentFrequency,
      scheduleType,
      disbursedAt,
      processingFee,
    } = args;

    const periods = this.periodsForTerm(termMonths, repaymentFrequency);
    const perYear = this.periodsPerYear(repaymentFrequency);
    const rate = (Number(interestRateAnnual || 0) / 100) / perYear;

    let outstanding = Number(principal);
    let periodicPayment = 0;
    const flatTotalInterest = this.round2((principal * Number(interestRateAnnual || 0)) / 100);
    const flatInterestPerPeriodBase = periods > 0 ? this.round2(flatTotalInterest / periods) : 0;
    let flatInterestAllocated = 0;

    if (scheduleType === 'reducing') {
      if (rate <= 0) {
        periodicPayment = principal / periods;
      } else {
        const factor = Math.pow(1 + rate, periods);
        periodicPayment = (principal * rate * factor) / (factor - 1);
      }
    }

    const installments: Partial<LoanInstallment>[] = [];

    for (let i = 1; i <= periods; i += 1) {
      let principalDue = 0;
      let interestDue = 0;

      if (scheduleType === 'flat') {
        principalDue = principal / periods;
        interestDue =
          i === periods
            ? this.round2(Math.max(0, flatTotalInterest - flatInterestAllocated))
            : flatInterestPerPeriodBase;
        if (i === periods) {
          principalDue = outstanding;
        }
        flatInterestAllocated = this.round2(flatInterestAllocated + interestDue);
      } else {
        interestDue = outstanding * rate;
        principalDue = rate <= 0 ? principal / periods : periodicPayment - interestDue;
        if (i === periods) {
          principalDue = outstanding;
        }
      }

      principalDue = this.round2(principalDue);
      interestDue = this.round2(interestDue);
      const feeDue = i === 1 ? this.round2(processingFee) : 0;
      const penaltyDue = 0;
      const totalDue = this.round2(principalDue + interestDue + feeDue + penaltyDue);

      const dueDate = this.toDateOnly(this.addPeriod(disbursedAt, i, repaymentFrequency));
      installments.push({
        loan: { id: loanId } as any,
        installmentNumber: i,
        dueDate,
        principalDue,
        interestDue,
        feeDue,
        penaltyDue,
        totalDue,
        principalPaid: 0,
        interestPaid: 0,
        feePaid: 0,
        penaltyPaid: 0,
        status: 'pending',
      });

      outstanding = this.round2(Math.max(0, outstanding - principalDue));
    }

    return installments;
  }

  private normalizeDateInput(dateInput?: string) {
    if (!dateInput) return this.toDateOnly(new Date());
    const trimmed = String(dateInput).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('date must be provided in YYYY-MM-DD format');
    }
    return trimmed;
  }

  private async resolveCollateral(args: {
    clientId: string;
    amount: number;
    isCollateralized: boolean;
    collateralAssetIds: string[];
    collateralNotes?: string;
  }): Promise<CollateralResolution> {
    const { clientId, amount, isCollateralized, collateralAssetIds, collateralNotes } = args;

    if (!isCollateralized) {
      return {
        collateralTotalMarketValue: undefined,
        collateralSnapshot: undefined,
      };
    }

    if (collateralAssetIds.length === 0) {
      throw new BadRequestException('collateralAssetIds are required for collateralized loans');
    }

    const assets = await this.clientAssetRepo
      .createQueryBuilder('asset')
      .where('asset.clientId = :clientId', { clientId })
      .andWhere('asset.status = :status', { status: 'active' })
      .andWhere('asset.id IN (:...assetIds)', { assetIds: collateralAssetIds })
      .getMany();

    if (assets.length !== collateralAssetIds.length) {
      throw new BadRequestException('One or more collateral assets are invalid or inactive');
    }

    const collateralTotalMarketValue = this.round2(
      assets.reduce((sum, asset) => sum + Number(asset.marketValue || 0), 0),
    );

    const coverageRatio = amount > 0 ? this.round2(collateralTotalMarketValue / amount) : 0;

    return {
      collateralTotalMarketValue,
      collateralSnapshot: {
        notes: collateralNotes || undefined,
        totalMarketValue: collateralTotalMarketValue,
        coverageRatio,
        assets: assets.map((asset) => ({
          assetId: asset.id,
          assetType: asset.assetType,
          description: asset.description || null,
          marketValue: Number(asset.marketValue || 0),
          valuationDate: asset.valuationDate,
        })),
      },
    };
  }

  private assertProductAmountBounds(amount: number, product?: LoanProduct) {
    if (!product) return;

    const minAmount = Number(product.minAmount || 0);
    const maxAmount = Number(product.maxAmount || 0);
    if (amount < minAmount || amount > maxAmount) {
      throw new BadRequestException(
        `Loan amount must be between ${minAmount} and ${maxAmount} for this product`,
      );
    }
  }

  private async maybeSendApprovalNotification(loan: Loan | null) {
    if (!loan) return;

    const firstDueDate = loan.installments?.[0]?.dueDate;
    const phone = (loan.client as any)?.phone;
    if (!phone) return;

    await this.notifications.enqueue({
      templateCode: 'LOAN_APPROVED_SMS',
      recipientId: (loan.client as any)?.id,
      recipientAddress: phone,
      payload: {
        clientName: (loan.client as any)?.name || 'Client',
        loanId: loan.id,
        firstDueDate: firstDueDate || 'N/A',
      },
    } as any);
  }

  private async maybeNotifyLoanApplicantStatusChange(
    loan: Loan | null,
    status: 'active' | 'rejected',
    actor?: any,
    reason?: string,
  ) {
    if (!loan) return;

    const recipientId = String((loan as any).appliedByUserId || '').trim();
    if (!recipientId) return;
    if (actor?.id && recipientId === actor.id) return;

    const clientName = String((loan.client as any)?.name || 'client');
    const message =
      status === 'active'
        ? `Loan ${loan.id} for ${clientName} has been approved.`
        : `Loan ${loan.id} for ${clientName} has been rejected${reason ? `: ${reason}` : '.'}`;

    await this.notifications.enqueue({
      channel: 'in_app',
      recipientId,
      recipientAddress: `user:${recipientId}`,
      message,
      payload: {
        loanId: loan.id,
        status,
        reason: reason || undefined,
        clientName,
      },
      maxAttempts: 1,
    } as any);
  }

  async create(data: LoanCreateInput, user?: any) {
    const clientId = (data.client as any)?.id;
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }

    const client = await this.clientRepo.findOne({ where: { id: clientId }, relations: ['branch'] });
    if (!client) {
      throw new BadRequestException(`Client with ID ${clientId} not found`);
    }

    const clientBranchId = ((client as any).branch as any)?.id || (client as any).branchId;
    if (user?.role !== 'admin' && user?.branch && clientBranchId && clientBranchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to create a loan for this client');
    }

    const gate = await this.evaluateClientLoanGate({ clientId });
    if (gate.pendingApplications.length > 0) {
      throw new BadRequestException('Client already has a pending loan application');
    }
    if (gate.outstandingInstallments.some((row) => row.source === 'loan_balance')) {
      throw new BadRequestException(
        'Client has an active loan with incomplete repayment schedule; resolve it before creating a new loan',
      );
    }
    if (gate.outstandingInstallments.length > 1) {
      throw new BadRequestException(
        'This client still has several payments left on an existing loan. They can apply for a new loan once only one payment is left.',
      );
    }

    const productId = data.productId || (data.product as any)?.id;
    const product = productId ? await this.productRepo.findOne({ where: { id: productId } }) : undefined;

    if (productId && !product) {
      throw new BadRequestException(`Loan product with ID ${productId} not found`);
    }
    if (product && !product.isActive) {
      throw new BadRequestException('Loan product is not active');
    }

    const amount = this.round2(Number(data.amount || 0));
    if (amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }
    this.assertProductAmountBounds(amount, product);

    const terms = this.normalizeTerms({
      termMonths: data.termMonths,
      interestRateAnnual: data.interestRateAnnual,
      repaymentFrequency: data.repaymentFrequency,
      currency: data.currency,
      product,
    });

    const collateralAssetIds = Array.isArray(data.collateralAssetIds)
      ? Array.from(new Set(data.collateralAssetIds.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      : [];
    const isCollateralized = Boolean(data.isCollateralized || collateralAssetIds.length > 0);

    const collateral = await this.resolveCollateral({
      clientId,
      amount,
      isCollateralized,
      collateralAssetIds,
      collateralNotes: data.collateralNotes,
    });

    const entity = this.repo.create({
      amount,
      balance: 0,
      status: 'pending',
      client: { id: clientId } as any,
      product: product ? ({ id: product.id } as any) : undefined,
      currency: terms.currency,
      interestRateAnnual: terms.interestRateAnnual,
      termMonths: terms.termMonths,
      repaymentFrequency: terms.repaymentFrequency,
      disbursedAt: undefined,
      dueAt: undefined,
      isCollateralized,
      collateralTotalMarketValue: collateral.collateralTotalMarketValue,
      collateralSnapshot: collateral.collateralSnapshot,
      loanOfficer: String((data as any).loanOfficer || user?.name || client.loanOfficer || '').trim() || undefined,
      appliedByUserId: user?.id || undefined,
      appliedByName: user?.name || undefined,
      approvedAt: undefined,
      approvedByUserId: undefined,
      rejectedAt: undefined,
      rejectedByUserId: undefined,
      rejectionReason: undefined,
    } as Loan);

    const saved = await this.repo.save(entity as Loan);

    const createdLoan = await this.findById(saved.id);

    try {
      const scoredClientId = clientId || (createdLoan as any)?.client?.id || null;
      const features = {
        amount,
        balance: amount,
        paid_total: 0,
        num_payments: 0,
        age_days: 0,
        client_tenure_days: 0,
      };
      await this.credit.scoreApplication(features, scoredClientId, createdLoan?.id, user);
    } catch (err) {
      this.logger.warn('Failed to perform credit scoring: ' + (err?.message || err));
    }

    return createdLoan;
  }

  findAll() {
    return this.repo.find({ relations: ['client', 'client.branch', 'payments', 'product', 'installments'] });
  }

  findAllScoped(user: any) {
    if (!user || user.role === 'admin') return this.findAll();
    return this.repo
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .leftJoinAndSelect('loan.payments', 'payments')
      .leftJoinAndSelect('loan.product', 'product')
      .leftJoinAndSelect('loan.installments', 'installments')
      .where('branch.id = :branchId', { branchId: user.branch })
      .getMany();
  }

  findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ['client', 'client.branch', 'payments', 'product', 'installments'],
    });
  }

  async findByIdScoped(id: string, user: any) {
    const loan = await this.findById(id);
    if (!loan) throw new NotFoundException('Loan not found');
    if (user?.role === 'admin') return loan;

    const branchId = ((loan.client as any)?.branch as any)?.id || (loan.client as any)?.branchId;
    if (!user?.branch || branchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to access this loan');
    }
    return loan;
  }

  async listScheduleScoped(id: string, user: any) {
    const loan = await this.findByIdScoped(id, user);
    const installments = await this.installmentRepo.find({
      where: { loan: { id } as any },
      order: { installmentNumber: 'ASC' },
    });

    if (installments.length === 0 && loan.status === 'pending') {
      const product = (loan.product as any)?.id
        ? await this.productRepo.findOne({ where: { id: (loan.product as any).id } })
        : undefined;
      const scheduleType = (product?.scheduleType || 'reducing') as ScheduleType;
      const processingFeeRate = Number(product?.processingFeeRate || 0);
      const processingFee = this.round2((Number(loan.amount || 0) * processingFeeRate) / 100);

      return this.buildRepaymentSchedule({
        loanId: loan.id,
        principal: Number(loan.amount || 0),
        interestRateAnnual: Number(loan.interestRateAnnual || product?.interestRateAnnual || 0),
        termMonths: Number(loan.termMonths || product?.termMonths || 1),
        repaymentFrequency: (loan.repaymentFrequency as RepaymentFrequency) || product?.repaymentFrequency || 'monthly',
        scheduleType,
        disbursedAt: new Date(),
        processingFee,
      });
    }

    const now = new Date();
    for (const row of installments) {
      if (row.status !== 'paid' && new Date(`${row.dueDate}T23:59:59.999Z`) < now) {
        row.status = 'overdue';
      }
    }

    return installments;
  }

  async portfolioSummary(user: any) {
    const loans = await this.findAllScoped(user);
    const approvedLoans = loans.filter((loan) => !['pending', 'rejected'].includes(loan.status));
    const portfolioLoans = approvedLoans.filter((loan) =>
      ['active', 'overdue', 'defaulted'].includes(loan.status),
    );
    const grossPortfolio = this.round2(
      portfolioLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0),
    );

    const installments = await this.installmentRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.loan', 'loan')
      .leftJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .getMany();

    const now = new Date();
    const overduePrincipal = {
      par1: 0,
      par30: 0,
      par90: 0,
    };

    for (const row of installments) {
      const branchId = (((row.loan as any)?.client as any)?.branch as any)?.id;
      if (user?.role !== 'admin' && branchId !== user?.branch) continue;

      const due = new Date(`${row.dueDate}T00:00:00.000Z`);
      if (row.status === 'paid' || due > now) continue;

      const overdueDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      const outstandingPrincipal = Math.max(0, Number(row.principalDue || 0) - Number(row.principalPaid || 0));

      if (overdueDays >= 1) overduePrincipal.par1 += outstandingPrincipal;
      if (overdueDays >= 30) overduePrincipal.par30 += outstandingPrincipal;
      if (overdueDays >= 90) overduePrincipal.par90 += outstandingPrincipal;
    }

    const asRatio = (amount: number) => (grossPortfolio > 0 ? this.round2((amount / grossPortfolio) * 100) : 0);

    return {
      asOf: now.toISOString(),
      totalLoans: approvedLoans.length,
      activeLoans: approvedLoans.filter((loan) => loan.status === 'active').length,
      overdueLoans: approvedLoans.filter((loan) => loan.status === 'overdue').length,
      defaultedLoans: approvedLoans.filter((loan) => loan.status === 'defaulted').length,
      grossPortfolio,
      overduePrincipal: {
        par1: this.round2(overduePrincipal.par1),
        par30: this.round2(overduePrincipal.par30),
        par90: this.round2(overduePrincipal.par90),
      },
      overdueRatio: {
        par1: asRatio(overduePrincipal.par1),
        par30: asRatio(overduePrincipal.par30),
        par90: asRatio(overduePrincipal.par90),
      },
    };
  }

  async update(id: string, updates: LoanUpdateInput) {
    const loan = await this.findById(id);
    if (!loan) throw new NotFoundException('Loan not found');
    return this.updateScoped(id, updates, { role: 'admin' });
  }

  async updateScoped(id: string, updates: LoanUpdateInput, user: any) {
    const loan = await this.findByIdScoped(id, user);

    if (loan.status !== 'pending') {
      throw new BadRequestException('Only pending loan applications can be updated');
    }

    const currentProductId = (loan.product as any)?.id;
    const nextProductId = updates.productId || currentProductId;
    const product = nextProductId
      ? await this.productRepo.findOne({ where: { id: nextProductId } })
      : undefined;

    if (nextProductId && !product) {
      throw new BadRequestException(`Loan product with ID ${nextProductId} not found`);
    }
    if (product && !product.isActive) {
      throw new BadRequestException('Loan product is not active');
    }

    const amount = this.round2(Number(updates.amount ?? loan.amount));
    if (amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }
    this.assertProductAmountBounds(amount, product);

    const terms = this.normalizeTerms({
      termMonths: updates.termMonths,
      interestRateAnnual: updates.interestRateAnnual,
      repaymentFrequency: updates.repaymentFrequency,
      currency: updates.currency,
      product,
      existing: loan,
      preferProductDefaults: Boolean(updates.productId),
    });

    const existingCollateralAssetIds = Array.isArray((loan.collateralSnapshot as any)?.assets)
      ? (loan.collateralSnapshot as any).assets
          .map((asset: any) => String(asset?.assetId || '').trim())
          .filter((id: string) => id.length > 0)
      : [];

    const rawCollateralAssetIds: string[] = updates.collateralAssetIds ?? existingCollateralAssetIds;
    const collateralAssetIds: string[] = Array.from(
      new Set(
        rawCollateralAssetIds.filter(
          (assetId): assetId is string => typeof assetId === 'string' && assetId.trim().length > 0,
        ),
      ),
    );

    const isCollateralized =
      updates.isCollateralized !== undefined
        ? Boolean(updates.isCollateralized)
        : Boolean(loan.isCollateralized || collateralAssetIds.length > 0);

    const previousNotes = String((loan.collateralSnapshot as any)?.notes || '').trim();
    const collateralNotes =
      updates.collateralNotes !== undefined ? updates.collateralNotes?.trim() : previousNotes || undefined;

    const collateral = await this.resolveCollateral({
      clientId: (loan.client as any)?.id,
      amount,
      isCollateralized,
      collateralAssetIds,
      collateralNotes,
    });

    await this.repo.update(id, {
      amount,
      product: product ? ({ id: product.id } as any) : loan.product,
      interestRateAnnual: terms.interestRateAnnual,
      termMonths: terms.termMonths,
      repaymentFrequency: terms.repaymentFrequency,
      currency: terms.currency,
      isCollateralized,
      collateralTotalMarketValue: collateral.collateralTotalMarketValue,
      collateralSnapshot: collateral.collateralSnapshot,
    } as any);

    return this.findById(id);
  }

  async setStatus(id: string, status: Loan['status'], actor?: any, options?: { reason?: string; disbursedAt?: string }) {
    const actingUser = actor || { role: 'admin' };
    return this.setStatusScoped(id, status, actingUser, options);
  }

  async setStatusScoped(
    id: string,
    status: Loan['status'],
    user: any,
    options?: { reason?: string; disbursedAt?: string },
  ) {
    if (!['active', 'rejected'].includes(status)) {
      throw new BadRequestException('Only active or rejected status transitions are supported via this endpoint');
    }

    const existingLoan = await this.findByIdScoped(id, user);
    if (existingLoan.status !== 'pending') {
      throw new BadRequestException('Only pending loan applications can be approved or rejected');
    }

    const updatedLoan = await this.repo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(Loan);
      const productRepo = manager.getRepository(LoanProduct);
      const installmentRepo = manager.getRepository(LoanInstallment);

      const loan = await loanRepo.findOne({
        where: { id },
        relations: ['client', 'client.branch', 'product'],
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const branchId = ((loan.client as any)?.branch as any)?.id;
      if (user?.role !== 'admin' && (!user?.branch || user.branch !== branchId)) {
        throw new ForbiddenException('You are not allowed to approve/reject this loan');
      }

      if (loan.status !== 'pending') {
        throw new BadRequestException('Only pending loan applications can be approved or rejected');
      }

      if (status === 'rejected') {
        loan.status = 'rejected';
        loan.rejectedAt = new Date();
        loan.rejectedByUserId = user?.id;
        loan.rejectionReason = options?.reason?.trim() || undefined;
        loan.approvedAt = null as any;
        loan.approvedByUserId = null as any;
        loan.disbursedAt = null as any;
        loan.dueAt = null as any;
        loan.balance = 0 as any;

        await installmentRepo.delete({ loan: { id: loan.id } as any });
        await loanRepo.save(loan);
      } else {
        const product = loan.product
          ? await productRepo.findOne({ where: { id: (loan.product as any)?.id } })
          : undefined;

        if (loan.product && !product) {
          throw new BadRequestException('Loan product referenced by loan was not found');
        }
        if (product && !product.isActive) {
          throw new BadRequestException('Loan product is no longer active');
        }

        const disbursedAt = this.parseIsoDateOrThrow(options?.disbursedAt, 'disbursedAt');
        const amount = Number(loan.amount || 0);
        if (amount <= 0) {
          throw new BadRequestException('Loan amount is invalid and cannot be approved');
        }

        const repaymentGate = await this.evaluateClientLoanGate({
          clientId: (loan.client as any)?.id,
          excludeLoanId: loan.id,
          manager,
        });
        if (repaymentGate.outstandingInstallments.some((row) => row.source === 'loan_balance')) {
          throw new BadRequestException(
            'Client has an active loan with incomplete repayment schedule; cannot approve this loan',
          );
        }
        if (repaymentGate.outstandingInstallments.length > 1) {
          throw new BadRequestException(
            'This client still has several payments left on an existing loan. Approve a new loan only when one payment is left.',
          );
        }

        if (repaymentGate.outstandingInstallments.length === 1) {
          await this.settleRolloverInstallment({
            manager,
            newLoan: loan,
            candidate: repaymentGate.outstandingInstallments[0],
            actor: user,
          });
        }

        const terms = this.normalizeTerms({
          termMonths: Number(loan.termMonths || product?.termMonths || 1),
          interestRateAnnual: Number(loan.interestRateAnnual ?? product?.interestRateAnnual ?? 0),
          repaymentFrequency: (loan.repaymentFrequency as RepaymentFrequency) || product?.repaymentFrequency,
          currency: loan.currency || product?.currency,
          product,
          existing: loan,
        });

        const scheduleType = (product?.scheduleType || 'reducing') as ScheduleType;
        const processingFeeRate = Number(product?.processingFeeRate || 0);
        const processingFee = this.round2((amount * processingFeeRate) / 100);
        const openingBalance = this.round2(amount + processingFee);

        await installmentRepo.delete({ loan: { id: loan.id } as any });

        const schedule = this.buildRepaymentSchedule({
          loanId: loan.id,
          principal: amount,
          interestRateAnnual: terms.interestRateAnnual,
          termMonths: terms.termMonths,
          repaymentFrequency: terms.repaymentFrequency,
          scheduleType,
          disbursedAt,
          processingFee,
        });

        if (schedule.length > 0) {
          if (schedule.some((row) => !(row.loan as any)?.id)) {
            throw new BadRequestException('Generated schedule contains missing loan relation');
          }
          await installmentRepo.save(installmentRepo.create(schedule as any));
        }

        loan.balance = openingBalance as any;
        loan.status = 'active';
        loan.currency = terms.currency;
        loan.interestRateAnnual = terms.interestRateAnnual as any;
        loan.termMonths = terms.termMonths;
        loan.repaymentFrequency = terms.repaymentFrequency;
        loan.disbursedAt = disbursedAt;
        loan.dueAt = schedule.length
          ? new Date(`${schedule[schedule.length - 1].dueDate as string}T00:00:00.000Z`)
          : null as any;
        loan.approvedAt = new Date();
        loan.approvedByUserId = user?.id;
        loan.rejectedAt = null as any;
        loan.rejectedByUserId = null as any;
        loan.rejectionReason = null as any;

        await loanRepo.save(loan);
      }

      return loanRepo.findOne({
        where: { id: loan.id },
        relations: ['client', 'client.branch', 'payments', 'product', 'installments'],
      });
    });

    if (status === 'active') {
      try {
        await this.maybeSendApprovalNotification(updatedLoan as any);
      } catch (err: any) {
        this.logger.warn('Loan approved, but notification failed: ' + (err?.message || err));
      }
    }

    try {
      await this.maybeNotifyLoanApplicantStatusChange(
        updatedLoan as any,
        status as 'active' | 'rejected',
        user,
        options?.reason,
      );
    } catch (err: any) {
      this.logger.warn('Loan status changed, but applicant notification failed: ' + (err?.message || err));
    }

    return updatedLoan;
  }

  async rebuildScheduleScoped(id: string, user: any) {
    const existingLoan = await this.findByIdScoped(id, user);

    if (!['active', 'overdue', 'defaulted'].includes(existingLoan.status)) {
      throw new BadRequestException('Schedule rebuild is only supported for active/overdue/defaulted loans');
    }

    const repaired = await this.repo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(Loan);
      const productRepo = manager.getRepository(LoanProduct);
      const installmentRepo = manager.getRepository(LoanInstallment);

      const loan = await loanRepo.findOne({
        where: { id },
        relations: ['client', 'client.branch', 'product'],
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const branchId = ((loan.client as any)?.branch as any)?.id;
      if (user?.role !== 'admin' && (!user?.branch || user.branch !== branchId)) {
        throw new ForbiddenException('You are not allowed to rebuild this loan schedule');
      }

      const product = loan.product
        ? await productRepo.findOne({ where: { id: (loan.product as any)?.id } })
        : undefined;

      const amount = Number(loan.amount || 0);
      if (amount <= 0) {
        throw new BadRequestException('Loan amount is invalid and cannot be scheduled');
      }

      const terms = this.normalizeTerms({
        termMonths: Number(loan.termMonths || product?.termMonths || 1),
        interestRateAnnual: Number(loan.interestRateAnnual ?? product?.interestRateAnnual ?? 0),
        repaymentFrequency: (loan.repaymentFrequency as RepaymentFrequency) || product?.repaymentFrequency,
        currency: loan.currency || product?.currency,
        product,
        existing: loan,
      });

      const disbursedAt = this.parseIsoDateOrThrow(
        loan.disbursedAt || loan.createdAt,
        'disbursedAt',
      );
      const scheduleType = (product?.scheduleType || 'reducing') as ScheduleType;
      const processingFeeRate = Number(product?.processingFeeRate || 0);
      const processingFee = this.round2((amount * processingFeeRate) / 100);

      await installmentRepo.delete({ loan: { id: loan.id } as any });
      const schedule = this.buildRepaymentSchedule({
        loanId: loan.id,
        principal: amount,
        interestRateAnnual: terms.interestRateAnnual,
        termMonths: terms.termMonths,
        repaymentFrequency: terms.repaymentFrequency,
        scheduleType,
        disbursedAt,
        processingFee,
      });

      if (schedule.length > 0) {
        if (schedule.some((row) => !(row.loan as any)?.id)) {
          throw new BadRequestException('Generated schedule contains missing loan relation');
        }
        await installmentRepo.save(installmentRepo.create(schedule as any));
      }

      loan.dueAt = schedule.length
        ? new Date(`${schedule[schedule.length - 1].dueDate as string}T00:00:00.000Z`)
        : loan.dueAt;
      await loanRepo.save(loan);

      return loanRepo.findOne({
        where: { id: loan.id },
        relations: ['client', 'client.branch', 'payments', 'product', 'installments'],
      });
    });

    return repaired;
  }

  async collectionsDueTodayScoped(user: any, dateInput?: string) {
    const asOfDate = this.normalizeDateInput(dateInput);

    const qb = this.installmentRepo
      .createQueryBuilder('installment')
      .innerJoinAndSelect('installment.loan', 'loan')
      .innerJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .where('installment.dueDate = :asOfDate', { asOfDate })
      .andWhere('installment.status IN (:...statuses)', {
        statuses: ['pending', 'partial', 'overdue'],
      })
      .andWhere('loan.status IN (:...loanStatuses)', {
        loanStatuses: ['active', 'overdue', 'defaulted'],
      })
      .orderBy('installment.installmentNumber', 'ASC');

    if (user?.role !== 'admin') {
      qb.andWhere('branch.id = :branchId', { branchId: user?.branch || '__NO_BRANCH__' });
    }

    const rows = await qb.getMany();

    const orphanedInstallments = await this.installmentRepo
      .createQueryBuilder('installment')
      .where('installment.dueDate = :asOfDate', { asOfDate })
      .andWhere('installment.loanId IS NULL')
      .andWhere('installment.status IN (:...statuses)', {
        statuses: ['pending', 'partial', 'overdue'],
      })
      .getCount();

    return {
      asOfDate,
      orphanedInstallments,
      items: rows.map((row) => ({
        installmentId: row.id,
        loanId: (row.loan as any)?.id,
        installmentNumber: row.installmentNumber,
        dueDate: row.dueDate,
        amountDue: Number(row.totalDue || 0),
        status: row.status,
        clientId: (row.loan as any)?.client?.id,
        clientName: (row.loan as any)?.client?.name,
        branchId: ((row.loan as any)?.client?.branch as any)?.id || null,
        branchName: ((row.loan as any)?.client?.branch as any)?.name || null,
        currency: (row.loan as any)?.currency || 'USD',
      })),
    };
  }
}
