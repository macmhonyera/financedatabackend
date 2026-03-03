import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { CreditScoreResult } from './scoring.entity';
import { CreditScoreFeatures, ScoringModelService } from './scoring.model';

export interface CreditScoreResultDto {
  id: string;
  clientId: string;
  loanId?: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  reasons: Array<{ feature: string; impact: number; note: string }>;
  modelVersion: string;
  computedAt: Date;
  inputsSnapshot: Record<string, any>;
}

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(CreditScoreResult)
    private readonly scoreRepo: Repository<CreditScoreResult>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly model: ScoringModelService,
  ) {}

  private toNumber(value: any, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toDateOrNull(value: any): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private monthsBetween(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.4375));
  }

  private decisionForGrade(grade: 'A' | 'B' | 'C' | 'D') {
    if (grade === 'A' || grade === 'B') return 'approve';
    if (grade === 'C') return 'review';
    return 'reject';
  }

  private mapResult(entity: CreditScoreResult): CreditScoreResultDto {
    return {
      id: entity.id,
      clientId: entity.clientId,
      loanId: entity.loanId,
      score: this.toNumber(entity.score),
      grade: entity.grade,
      reasons: Array.isArray(entity.reasons) ? entity.reasons : [],
      modelVersion: entity.modelVersion,
      computedAt: entity.computedAt,
      inputsSnapshot: entity.inputsSnapshot || {},
    };
  }

  private assertClientScope(client: Client, user?: any) {
    if (!user || user.role === 'admin') return;

    const clientBranchId = (client.branch as any)?.id || (client as any)?.branchId;
    if (!user.branch || !clientBranchId || user.branch !== clientBranchId) {
      throw new ForbiddenException('You are not allowed to access this client credit score');
    }
  }

  private async getScopedClient(clientId: string, user?: any, withHistory = false) {
    const relations = withHistory
      ? ['branch', 'loans', 'loans.payments', 'loans.installments']
      : ['branch'];

    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      relations,
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    this.assertClientScope(client, user);
    return client;
  }

  private buildFeatures(client: Client, asOf: Date) {
    const loans = (Array.isArray((client as any)?.loans) ? (client as any).loans : []) as Loan[];

    let totalBorrowed = 0;
    let totalOutstanding = 0;
    let totalPayments = 0;
    let completedLoans = 0;
    let defaultedLoans = 0;
    let activeLoans = 0;
    let dueInstallments = 0;
    let paidOnTimeInstallments = 0;
    let maxDaysPastDue = 0;
    let monthlyDebtService = 0;

    const plus30Days = new Date(asOf);
    plus30Days.setDate(plus30Days.getDate() + 30);

    for (const loan of loans) {
      const amount = this.toNumber((loan as any)?.amount);
      const balance = this.toNumber((loan as any)?.balance);
      const status = String((loan as any)?.status || '').toLowerCase();

      totalBorrowed += amount;
      if (!['completed', 'rejected'].includes(status)) {
        totalOutstanding += Math.max(0, balance);
      }

      if (status === 'completed') completedLoans += 1;
      if (status === 'defaulted') defaultedLoans += 1;
      if (['active', 'overdue', 'pending'].includes(status)) activeLoans += 1;

      const payments = Array.isArray((loan as any)?.payments) ? (loan as any).payments : [];
      totalPayments += payments.length;

      const installments = Array.isArray((loan as any)?.installments) ? (loan as any).installments : [];
      for (const installment of installments as LoanInstallment[]) {
        const dueDate = this.toDateOrNull(`${(installment as any)?.dueDate}T23:59:59.999Z`);
        if (!dueDate) continue;

        const principalDue = this.toNumber((installment as any)?.principalDue);
        const interestDue = this.toNumber((installment as any)?.interestDue);
        const feeDue = this.toNumber((installment as any)?.feeDue);
        const penaltyDue = this.toNumber((installment as any)?.penaltyDue);
        const totalDue = this.toNumber((installment as any)?.totalDue, principalDue + interestDue + feeDue + penaltyDue);

        const principalPaid = this.toNumber((installment as any)?.principalPaid);
        const interestPaid = this.toNumber((installment as any)?.interestPaid);
        const feePaid = this.toNumber((installment as any)?.feePaid);
        const penaltyPaid = this.toNumber((installment as any)?.penaltyPaid);
        const totalPaid = principalPaid + interestPaid + feePaid + penaltyPaid;
        const installmentOutstanding = this.clamp(totalDue - totalPaid, 0, Number.MAX_SAFE_INTEGER);

        const rowStatus = String((installment as any)?.status || '').toLowerCase();
        if (dueDate <= asOf) {
          dueInstallments += 1;

          if (rowStatus === 'paid') {
            const paidAt = this.toDateOrNull((installment as any)?.paidAt);
            if (!paidAt || paidAt <= dueDate) {
              paidOnTimeInstallments += 1;
            }
          } else {
            const overdueDays = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (overdueDays > maxDaysPastDue) {
              maxDaysPastDue = overdueDays;
            }
          }
        }

        if (dueDate <= plus30Days && installmentOutstanding > 0 && rowStatus !== 'paid') {
          monthlyDebtService += installmentOutstanding;
        }
      }
    }

    const onTimeRatio = dueInstallments > 0 ? paidOnTimeInstallments / dueInstallments : null;

    const clientCreatedAt = this.toDateOrNull((client as any)?.createdAt);
    let tenureStart = clientCreatedAt;
    if (!tenureStart) {
      const possibleDates = loans
        .map((loan) => this.toDateOrNull((loan as any)?.disbursedAt || (loan as any)?.createdAt))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime());
      tenureStart = possibleDates[0] || asOf;
    }

    const monthlyIncomeRaw = (client as any)?.monthlyIncome;
    const monthlyIncome = monthlyIncomeRaw === undefined || monthlyIncomeRaw === null
      ? null
      : this.toNumber(monthlyIncomeRaw, 0);

    const features: CreditScoreFeatures = {
      onTimeRatio,
      maxDaysPastDue,
      defaultedLoans,
      completedLoans,
      activeLoans,
      totalLoans: loans.length,
      totalBorrowed: Number(totalBorrowed.toFixed(2)),
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      totalPayments,
      monthlyIncome,
      monthlyDebtService:
        monthlyIncome !== null ? Number(monthlyDebtService.toFixed(2)) : null,
      clientTenureMonths: this.monthsBetween(tenureStart, asOf),
      clientStatus: (client as any)?.status || null,
    };

    const snapshot = {
      asOf: asOf.toISOString(),
      features,
      aggregates: {
        dueInstallments,
        paidOnTimeInstallments,
      },
    };

    return { features, snapshot };
  }

  async computeForClient(
    clientId: string,
    user?: any,
    context?: { loanId?: string },
  ): Promise<CreditScoreResultDto> {
    const asOf = new Date();
    const client = await this.getScopedClient(clientId, user, true);
    const { features, snapshot } = this.buildFeatures(client, asOf);
    const computed = this.model.compute(features);

    const entity = this.scoreRepo.create({
      clientId: client.id,
      client: { id: client.id } as any,
      loanId: context?.loanId,
      score: computed.score,
      grade: computed.grade,
      reasons: computed.reasons,
      modelVersion: computed.modelVersion,
      inputsSnapshot: snapshot,
      computedByUserId: user?.id,
    } as Partial<CreditScoreResult>);

    const saved = await this.scoreRepo.save(entity);
    return this.mapResult(saved);
  }

  async getLatestForClient(clientId: string, user?: any): Promise<CreditScoreResultDto> {
    await this.getScopedClient(clientId, user, false);

    const latest = await this.scoreRepo.findOne({
      where: { clientId },
      order: { computedAt: 'DESC' },
    });

    if (!latest) {
      throw new NotFoundException('No credit score found for this client');
    }

    return this.mapResult(latest);
  }

  async getHistoryForClient(clientId: string, user?: any, limit = 50): Promise<CreditScoreResultDto[]> {
    await this.getScopedClient(clientId, user, false);

    const safeLimit = Math.max(1, Math.min(500, Number(limit || 50)));
    const rows = await this.scoreRepo.find({
      where: { clientId },
      order: { computedAt: 'DESC' },
      take: safeLimit,
    });

    return rows.map((row) => this.mapResult(row));
  }

  async listAll(user?: any, limit = 1000): Promise<CreditScoreResultDto[]> {
    const safeLimit = Math.max(1, Math.min(2000, Number(limit || 1000)));

    const qb = this.scoreRepo
      .createQueryBuilder('score')
      .leftJoinAndSelect('score.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .orderBy('score.computedAt', 'DESC')
      .take(safeLimit);

    if (user?.role && user.role !== 'admin') {
      qb.andWhere('branch.id = :branchId', { branchId: user?.branch || '' });
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.mapResult(row));
  }

  async modelHealth(user?: any) {
    const rows = await this.listAll(user, 2000);

    if (rows.length === 0) {
      return {
        totalScored: 0,
        avgScore: 0,
        byGrade: {},
        byModelVersion: {},
      };
    }

    let scoreSum = 0;
    const byGrade: Record<string, number> = {};
    const byModelVersion: Record<string, number> = {};

    for (const row of rows) {
      scoreSum += this.toNumber(row.score);
      byGrade[row.grade] = (byGrade[row.grade] || 0) + 1;
      byModelVersion[row.modelVersion] = (byModelVersion[row.modelVersion] || 0) + 1;
    }

    return {
      totalScored: rows.length,
      avgScore: Number((scoreSum / rows.length).toFixed(2)),
      byGrade,
      byModelVersion,
    };
  }

  async scoreFromLegacyPayload(
    payload: {
      amount: number;
      balance: number;
      paid_total?: number;
      num_payments?: number;
      age_days?: number;
      client_tenure_days?: number;
      clientId?: string;
      loanId?: string;
    },
    user?: any,
  ) {
    if (payload.clientId) {
      const saved = await this.computeForClient(payload.clientId, user, {
        loanId: payload.loanId,
      });

      return {
        score: saved.score,
        grade: saved.grade,
        prob_default: Number((1 - saved.score / 100).toFixed(4)),
        decision: this.decisionForGrade(saved.grade),
        explanations: saved.reasons,
        model_version: saved.modelVersion,
      };
    }

    const amount = this.toNumber(payload.amount);
    const balance = this.toNumber(payload.balance);
    const paidTotal = this.toNumber(payload.paid_total);
    const numPayments = this.toNumber(payload.num_payments);
    const ageDays = Math.max(0, this.toNumber(payload.age_days));
    const clientTenureDays = Math.max(0, this.toNumber(payload.client_tenure_days));

    const estimatedOnTimeRatio = amount > 0 ? this.clamp(paidTotal / amount, 0, 1) : null;

    const features: CreditScoreFeatures = {
      onTimeRatio: estimatedOnTimeRatio,
      maxDaysPastDue: ageDays,
      defaultedLoans: 0,
      completedLoans: paidTotal >= amount && amount > 0 ? 1 : 0,
      activeLoans: balance > 0 ? 1 : 0,
      totalLoans: amount > 0 ? 1 : 0,
      totalBorrowed: amount,
      totalOutstanding: Math.max(0, balance),
      totalPayments: numPayments,
      monthlyIncome: null,
      monthlyDebtService: null,
      clientTenureMonths: Math.floor(clientTenureDays / 30.4375),
      clientStatus: 'active',
    };

    const computed = this.model.compute(features);

    return {
      score: computed.score,
      grade: computed.grade,
      prob_default: Number((1 - computed.score / 100).toFixed(4)),
      decision: this.decisionForGrade(computed.grade),
      explanations: computed.reasons,
      model_version: computed.modelVersion,
    };
  }
}
