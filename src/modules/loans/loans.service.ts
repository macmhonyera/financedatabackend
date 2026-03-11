import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Loan } from '../../entities/loan.entity';
import { Client } from '../../entities/client.entity';
import { CreditService } from '../credit/credit.service';
import { LoanProduct, RepaymentFrequency, ScheduleType } from '../../entities/loan-product.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { NotificationsService } from '../notifications/notifications.service';

type LoanCreateInput = Partial<Loan> & {
  productId?: string;
  termMonths?: number;
  interestRateAnnual?: number;
  repaymentFrequency?: RepaymentFrequency;
  currency?: string;
  disbursedAt?: string | Date;
};

type SetLoanStatusOptions = {
  disbursedAt?: string | Date;
  reason?: string;
};

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectRepository(Loan) private repo: Repository<Loan>,
    @InjectRepository(Client) private clientRepo: Repository<Client>,
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
        interestDue = principal * rate;
        if (i === periods) {
          principalDue = outstanding;
        }
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

    const productId = data.productId || (data.product as any)?.id;
    const product = productId
      ? await this.productRepo.findOne({ where: { id: productId } })
      : undefined;

    if (productId && !product) {
      throw new BadRequestException(`Loan product with ID ${productId} not found`);
    }
    if (product && !product.isActive) {
      throw new BadRequestException('Loan product is not active');
    }

    const amount = Number(data.amount || 0);
    if (amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    if (product) {
      const minAmount = Number(product.minAmount || 0);
      const maxAmount = Number(product.maxAmount || 0);
      if (amount < minAmount || amount > maxAmount) {
        throw new BadRequestException(`Loan amount must be between ${minAmount} and ${maxAmount} for this product`);
      }
    }

    const interestRateAnnual = Number(data.interestRateAnnual ?? product?.interestRateAnnual ?? 0);
    const termMonths = Number(data.termMonths ?? product?.termMonths ?? 1);
    const repaymentFrequency =
      (data.repaymentFrequency as RepaymentFrequency) || product?.repaymentFrequency || 'monthly';
    const currency = (data.currency || product?.currency || 'USD').toUpperCase();
    const scheduleType = (product?.scheduleType || 'reducing') as ScheduleType;
    const processingFeeRate = Number(product?.processingFeeRate || 0);
    const processingFee = this.round2((amount * processingFeeRate) / 100);
    const openingBalance = this.round2(amount + processingFee);

    const disbursedAt = data.disbursedAt ? new Date(data.disbursedAt) : new Date();
    if (Number.isNaN(disbursedAt.getTime())) {
      throw new BadRequestException('disbursedAt must be a valid date');
    }

    const createdLoan = await this.repo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(Loan);
      const installmentRepo = manager.getRepository(LoanInstallment);

      const entity = loanRepo.create({
        amount: this.round2(amount),
        balance: openingBalance,
        status: 'pending',
        client: { id: clientId } as any,
        product: product ? ({ id: product.id } as any) : undefined,
        currency,
        interestRateAnnual,
        termMonths,
        repaymentFrequency,
        disbursedAt,
      } as Loan);

      const saved = await loanRepo.save(entity as Loan);

      const schedule = this.buildRepaymentSchedule({
        loanId: saved.id,
        principal: amount,
        interestRateAnnual,
        termMonths,
        repaymentFrequency,
        scheduleType,
        disbursedAt,
        processingFee,
      });

      if (schedule.length > 0) {
        await installmentRepo.save(schedule as any);
        saved.dueAt = new Date(`${schedule[schedule.length - 1].dueDate as string}T00:00:00.000Z`);
        await loanRepo.save(saved);
      }

      return loanRepo.findOne({
        where: { id: saved.id },
        relations: ['client', 'client.branch', 'payments', 'product', 'installments'],
      });
    });

    try {
      const scoredClientId = (data.client as any)?.id || (createdLoan as any)?.client?.id || null;
      const features = {
        amount,
        balance: openingBalance,
        paid_total: 0,
        num_payments: 0,
        age_days: 0,
        client_tenure_days: 0,
      };
      this.credit.scoreApplication(features, scoredClientId, createdLoan?.id).catch((err) => {
        this.logger.warn('Credit scoring failed for loan ' + createdLoan?.id + ': ' + (err?.message || err));
      });
    } catch (err) {
      this.logger.warn('Failed to enqueue credit scoring: ' + (err?.message || err));
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
    await this.findByIdScoped(id, user);
    const installments = await this.installmentRepo.find({
      where: { loan: { id } as any },
      order: { installmentNumber: 'ASC' },
    });

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
    const portfolioLoans = loans.filter((loan) => ['active', 'overdue', 'defaulted'].includes(loan.status));
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
      totalLoans: loans.length,
      activeLoans: loans.filter((loan) => loan.status === 'active').length,
      overdueLoans: loans.filter((loan) => loan.status === 'overdue').length,
      defaultedLoans: loans.filter((loan) => loan.status === 'defaulted').length,
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

  async update(id: string, updates: Partial<Loan>) {
    await this.repo.update(id, updates as any);
    return this.findById(id);
  }

  async updateScoped(id: string, updates: Partial<Loan>, user: any) {
    await this.findByIdScoped(id, user);
    await this.repo.update(id, updates as any);
    return this.findById(id);
  }

  async collectionsDueTodayScoped(user: any, date?: string) {
    let dueDate: string;
    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('date must be a valid date');
      }
      dueDate = this.toDateOnly(parsed);
    } else {
      dueDate = this.toDateOnly(new Date());
    }

    const query = this.installmentRepo
      .createQueryBuilder('installment')
      .leftJoinAndSelect('installment.loan', 'loan')
      .leftJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .where('installment.dueDate = :dueDate', { dueDate })
      .andWhere('installment.status != :paidStatus', { paidStatus: 'paid' })
      .orderBy('client.name', 'ASC')
      .addOrderBy('installment.installmentNumber', 'ASC');

    if (user?.role !== 'admin') {
      if (!user?.branch) {
        throw new ForbiddenException('Branch scope is required');
      }
      query.andWhere('branch.id = :branchId', { branchId: user.branch });
    }

    return query.getMany();
  }

  async rebuildScheduleScoped(id: string, user: any) {
    const loan = await this.findByIdScoped(id, user);
    if (loan.payments?.length) {
      throw new BadRequestException('Cannot rebuild schedule for a loan that already has payments');
    }

    const principal = Number(loan.amount || 0);
    if (principal <= 0) {
      throw new BadRequestException('Loan amount must be greater than 0');
    }

    const termMonths = Number(loan.termMonths || 0);
    if (termMonths <= 0) {
      throw new BadRequestException('Loan term is required to rebuild schedule');
    }

    const repaymentFrequency = (loan.repaymentFrequency || 'monthly') as RepaymentFrequency;
    const interestRateAnnual = Number(loan.interestRateAnnual || 0);
    const scheduleType = ((loan.product as any)?.scheduleType || 'reducing') as ScheduleType;
    const processingFeeRate = Number((loan.product as any)?.processingFeeRate || 0);
    const processingFee = this.round2((principal * processingFeeRate) / 100);
    const disbursedAt = loan.disbursedAt ? new Date(loan.disbursedAt) : new Date();
    if (Number.isNaN(disbursedAt.getTime())) {
      throw new BadRequestException('Loan disbursedAt must be a valid date');
    }

    const schedule = this.buildRepaymentSchedule({
      loanId: id,
      principal,
      interestRateAnnual,
      termMonths,
      repaymentFrequency,
      scheduleType,
      disbursedAt,
      processingFee,
    });

    await this.repo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(Loan);
      const installmentRepo = manager.getRepository(LoanInstallment);

      await installmentRepo.delete({ loan: { id } as any } as any);
      if (schedule.length > 0) {
        await installmentRepo.save(schedule as any);
      }

      await loanRepo.update(
        { id } as any,
        {
          balance: this.round2(principal + processingFee),
          disbursedAt,
          dueAt:
            schedule.length > 0
              ? new Date(`${schedule[schedule.length - 1].dueDate as string}T00:00:00.000Z`)
              : null,
        } as any,
      );
    });

    return this.findByIdScoped(id, user);
  }

  async setStatus(id: string, status: Loan['status']) {
    await this.repo.update(id, { status } as any);
    const loan = await this.findById(id);
    if (loan && status === 'active') {
      const firstDueDate = loan.installments?.[0]?.dueDate;
      const phone = (loan.client as any)?.phone;
      if (phone) {
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
    }
    return loan;
  }

  async setStatusScoped(id: string, status: Loan['status'], user: any, options?: SetLoanStatusOptions) {
    const existing = await this.findByIdScoped(id, user);
    const updates: Partial<Loan> = { status };

    if (status === 'active') {
      updates.approvedAt = new Date();
      updates.approvedByUserId = user?.id || user?.sub || null;

      if (options?.disbursedAt) {
        const parsed = new Date(options.disbursedAt);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException('disbursedAt must be a valid date');
        }
        updates.disbursedAt = parsed;
      } else if (!existing.disbursedAt) {
        updates.disbursedAt = new Date();
      }
    }

    if (status === 'rejected') {
      updates.rejectedAt = new Date();
      updates.rejectedByUserId = user?.id || user?.sub || null;
      if (options?.reason) {
        updates.rejectionReason = String(options.reason).trim();
      }
    }

    await this.repo.update(id, updates as any);
    const loan = await this.findById(id);
    if (loan && status === 'active') {
      const firstDueDate = loan.installments?.[0]?.dueDate;
      const phone = (loan.client as any)?.phone;
      if (phone) {
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
    }
    return loan;
  }
}
