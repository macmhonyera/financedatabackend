import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';
import { ClientAsset } from '../../entities/client-asset.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentPromise } from '../../entities/payment-promise.entity';
import { RecoveryAction } from '../../entities/recovery-action.entity';
import { FieldVisit } from '../../entities/field-visit.entity';

const DEFAULT_LIMIT = 500;

type AuthUser = { id: string; role: string; branch?: string | null };

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientAsset) private readonly assetRepo: Repository<ClientAsset>,
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
    @InjectRepository(LoanInstallment)
    private readonly installmentRepo: Repository<LoanInstallment>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentPromise)
    private readonly promiseRepo: Repository<PaymentPromise>,
    @InjectRepository(RecoveryAction)
    private readonly recoveryRepo: Repository<RecoveryAction>,
    @InjectRepository(FieldVisit)
    private readonly fieldVisitRepo: Repository<FieldVisit>,
  ) {}

  async loanOfficerDelta(user: AuthUser, since?: string, limit?: number) {
    const branchId = (user.branch || '').trim();
    if (!branchId) {
      throw new ForbiddenException('Sync endpoint requires a branch-scoped user');
    }

    const sinceDate = since ? new Date(since) : null;
    const cap = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), 1000);

    const syncedAt = new Date();

    const [clients, clientAssets, loans, installments, payments, paymentPromises, recoveryActions, fieldVisits] =
      await Promise.all([
        this.fetchClients(branchId, sinceDate, cap),
        this.fetchClientAssets(branchId, sinceDate, cap),
        this.fetchLoans(branchId, sinceDate, cap),
        this.fetchInstallments(branchId, sinceDate, cap),
        this.fetchPayments(branchId, sinceDate, cap),
        this.fetchPromises(branchId, sinceDate, cap),
        this.fetchRecovery(branchId, sinceDate, cap),
        this.fetchFieldVisits(branchId, sinceDate, cap),
      ]);

    const hasMore =
      clients.length === cap ||
      clientAssets.length === cap ||
      loans.length === cap ||
      installments.length === cap ||
      payments.length === cap ||
      paymentPromises.length === cap ||
      recoveryActions.length === cap ||
      fieldVisits.length === cap;

    return {
      syncedAt: syncedAt.toISOString(),
      branchId,
      hasMore,
      entities: {
        clients,
        clientAssets,
        loans,
        installments,
        payments,
        paymentPromises,
        recoveryActions,
        fieldVisits,
      },
    };
  }

  private fetchClientAssets(branchId: string, since: Date | null, limit: number) {
    const qb = this.assetRepo
      .createQueryBuilder('asset')
      .leftJoin('asset.client', 'client')
      .leftJoin('client.branch', 'branch')
      .where('branch.id = :branchId', { branchId });
    if (since) qb.andWhere('asset.updatedAt > :since', { since });
    return qb.orderBy('asset.updatedAt', 'ASC').take(limit).getMany();
  }

  private fetchFieldVisits(branchId: string, since: Date | null, limit: number) {
    const qb = this.fieldVisitRepo
      .createQueryBuilder('visit')
      .leftJoin('visit.client', 'client')
      .leftJoin('client.branch', 'branch')
      .where('branch.id = :branchId', { branchId });
    if (since) qb.andWhere('visit.updatedAt > :since', { since });
    return qb.orderBy('visit.updatedAt', 'ASC').take(limit).getMany();
  }

  private fetchClients(branchId: string, since: Date | null, limit: number) {
    const qb = this.clientRepo
      .createQueryBuilder('client')
      .leftJoin('client.branch', 'branch')
      // documents is `select: false` on the entity so opt in explicitly
      .addSelect('client.documents')
      .where('branch.id = :branchId', { branchId });
    if (since) qb.andWhere('client.updatedAt > :since', { since });
    return qb.orderBy('client.updatedAt', 'ASC').take(limit).getMany();
  }

  private fetchLoans(branchId: string, since: Date | null, limit: number) {
    const qb = this.loanRepo
      .createQueryBuilder('loan')
      .leftJoin('loan.client', 'client')
      .leftJoin('client.branch', 'branch')
      .leftJoinAndSelect('loan.product', 'product')
      .where('branch.id = :branchId', { branchId })
      .addSelect(['client.id']);
    if (since) qb.andWhere('loan.updatedAt > :since', { since });
    return qb.orderBy('loan.updatedAt', 'ASC').take(limit).getMany();
  }

  private fetchInstallments(branchId: string, since: Date | null, limit: number) {
    const qb = this.installmentRepo
      .createQueryBuilder('installment')
      .leftJoin('installment.loan', 'loan')
      .leftJoin('loan.client', 'client')
      .leftJoin('client.branch', 'branch')
      .where('branch.id = :branchId', { branchId });
    if (since) qb.andWhere('installment.updatedAt > :since', { since });
    return qb.orderBy('installment.updatedAt', 'ASC').take(limit).getMany();
  }

  private fetchPayments(branchId: string, since: Date | null, limit: number) {
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoin('payment.loan', 'loan')
      .leftJoin('loan.client', 'client')
      .leftJoin('client.branch', 'branch')
      .where('branch.id = :branchId', { branchId })
      .addSelect(['loan.id', 'client.id']);
    if (since) qb.andWhere('payment.updatedAt > :since', { since });
    return qb.orderBy('payment.updatedAt', 'ASC').take(limit).getMany();
  }

  private async fetchPromises(branchId: string, since: Date | null, limit: number) {
    const where: any = since
      ? { borrower: { branch: { id: branchId } }, updatedAt: MoreThan(since) }
      : { borrower: { branch: { id: branchId } } };
    return this.promiseRepo.find({
      where,
      order: { updatedAt: 'ASC' },
      take: limit,
    });
  }

  private async fetchRecovery(branchId: string, since: Date | null, limit: number) {
    const where: any = since
      ? { borrower: { branch: { id: branchId } }, updatedAt: MoreThan(since) }
      : { borrower: { branch: { id: branchId } } };
    return this.recoveryRepo.find({
      where,
      order: { updatedAt: 'ASC' },
      take: limit,
    });
  }
}
