import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycProfile } from '../../entities/kyc-profile.entity';
import { Complaint, ComplaintStatus } from '../../entities/complaint.entity';
import { AmlEvent } from '../../entities/aml-event.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { UpsertKycDto } from './dto/upsert-kyc.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { CreateAmlEventDto } from './dto/create-aml-event.dto';

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(KycProfile) private kycRepo: Repository<KycProfile>,
    @InjectRepository(Complaint) private complaintRepo: Repository<Complaint>,
    @InjectRepository(AmlEvent) private amlRepo: Repository<AmlEvent>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(LoanInstallment) private installmentRepo: Repository<LoanInstallment>,
  ) {}

  private round2(value: number) {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  private async writeAudit(action: string, entityType: string, entityId: string | undefined, user: any, metadata?: any) {
    const entry = this.auditRepo.create({
      action,
      entityType,
      entityId,
      actorId: user?.id,
      actorRole: user?.role,
      metadata,
    } as any);
    await this.auditRepo.save(entry);
  }

  private assertBranchAccess(user: any, branchId?: string) {
    if (!user || user.role === 'admin') return;
    if (!user.branch || !branchId || user.branch !== branchId) {
      throw new ForbiddenException('You are not allowed to access this branch data');
    }
  }

  private async getClientScoped(clientId: string, user: any) {
    const client = await this.clientRepo.findOne({ where: { id: clientId }, relations: ['branch'] });
    if (!client) throw new NotFoundException('Client not found');
    const branchId = ((client.branch as any)?.id || (client as any)?.branchId) as string | undefined;
    this.assertBranchAccess(user, branchId);
    return client;
  }

  async upsertKyc(clientId: string, dto: UpsertKycDto, user: any) {
    const client = await this.getClientScoped(clientId, user);

    const existing = await this.kycRepo.findOne({ where: { client: { id: clientId } as any }, relations: ['client'] });

    if (existing) {
      Object.assign(existing, dto);
      existing.lastReviewedAt = new Date();
      const saved = await this.kycRepo.save(existing);
      await this.writeAudit('KYC_UPDATED', 'KycProfile', saved.id, user, { clientId });
      return saved;
    }

    const created = this.kycRepo.create({
      ...dto,
      client: { id: client.id } as any,
      cddStatus: dto.cddStatus || 'pending',
      riskRating: dto.riskRating || 'medium',
      pep: dto.pep ?? false,
      sanctionsHit: dto.sanctionsHit ?? false,
      lastReviewedAt: new Date(),
    } as KycProfile);

    const saved = await this.kycRepo.save(created as KycProfile);
    await this.writeAudit('KYC_CREATED', 'KycProfile', saved.id, user, { clientId });
    return saved;
  }

  async getKycByClient(clientId: string, user: any) {
    await this.getClientScoped(clientId, user);
    return this.kycRepo.findOne({ where: { client: { id: clientId } as any }, relations: ['client'] });
  }

  async createComplaint(dto: CreateComplaintDto, user: any) {
    let branchId: string | undefined;
    let clientId: string | undefined;

    if (dto.clientId) {
      const client = await this.getClientScoped(dto.clientId, user);
      branchId = ((client.branch as any)?.id || (client as any)?.branchId) as string | undefined;
      clientId = client.id;
    } else if (user?.branch) {
      branchId = user.branch;
    }

    const complaint = this.complaintRepo.create({
      client: clientId ? ({ id: clientId } as any) : undefined,
      branchId,
      channel: dto.channel || 'in_app',
      category: dto.category,
      description: dto.description,
      status: 'open',
      assignedToUserId: dto.assignedToUserId,
    } as Complaint);

    const saved = await this.complaintRepo.save(complaint as Complaint);
    await this.writeAudit('COMPLAINT_CREATED', 'Complaint', saved.id, user, { branchId });
    return saved;
  }

  listComplaints(user: any, status?: ComplaintStatus) {
    const qb = this.complaintRepo
      .createQueryBuilder('complaint')
      .leftJoinAndSelect('complaint.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .orderBy('complaint.createdAt', 'DESC');

    if (status) {
      qb.andWhere('complaint.status = :status', { status });
    }

    if (user?.role !== 'admin') {
      qb.andWhere('complaint.branchId = :branchId', { branchId: user?.branch || '' });
    }

    return qb.getMany();
  }

  async updateComplaintStatus(id: string, dto: UpdateComplaintStatusDto, user: any) {
    const complaint = await this.complaintRepo.findOne({ where: { id }, relations: ['client'] });
    if (!complaint) throw new NotFoundException('Complaint not found');

    this.assertBranchAccess(user, complaint.branchId);

    complaint.status = dto.status;
    if (dto.assignedToUserId !== undefined) complaint.assignedToUserId = dto.assignedToUserId;
    if (dto.resolutionSummary !== undefined) complaint.resolutionSummary = dto.resolutionSummary;
    if (dto.status === 'resolved' || dto.status === 'rejected') {
      complaint.resolvedAt = new Date();
    }

    const saved = await this.complaintRepo.save(complaint);
    await this.writeAudit('COMPLAINT_STATUS_UPDATED', 'Complaint', id, user, {
      status: dto.status,
    });

    return saved;
  }

  async createAmlEvent(dto: CreateAmlEventDto, user: any) {
    let client: Client | undefined;
    if (dto.clientId) {
      client = await this.getClientScoped(dto.clientId, user);
    }

    const event = this.amlRepo.create({
      client: client ? ({ id: client.id } as any) : undefined,
      eventType: dto.eventType,
      severity: dto.severity || 'medium',
      status: dto.status || 'open',
      details: dto.details,
      reportedAt: dto.status === 'reported' ? new Date() : undefined,
    } as AmlEvent);

    const saved = await this.amlRepo.save(event as AmlEvent);
    await this.writeAudit('AML_EVENT_CREATED', 'AmlEvent', saved.id, user, {
      eventType: dto.eventType,
      severity: dto.severity,
    });

    return saved;
  }

  listAmlEvents(user: any, status?: string) {
    const qb = this.amlRepo
      .createQueryBuilder('aml')
      .leftJoinAndSelect('aml.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .orderBy('aml.createdAt', 'DESC');

    if (status) qb.andWhere('aml.status = :status', { status });

    if (user?.role !== 'admin') {
      qb.andWhere('branch.id = :branchId', { branchId: user?.branch || '' });
    }

    return qb.getMany();
  }

  async regulatoryMetrics(user: any) {
    const loans = await this.loanRepo
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .getMany();

    const scopedLoans =
      user?.role === 'admin'
        ? loans
        : loans.filter((loan) => ((loan.client as any)?.branch as any)?.id === user?.branch);

    const portfolioLoans = scopedLoans.filter((loan) => ['active', 'overdue', 'defaulted'].includes(loan.status));
    const grossPortfolio = this.round2(
      portfolioLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0),
    );

    const installments = await this.installmentRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.loan', 'loan')
      .leftJoinAndSelect('loan.client', 'client')
      .leftJoinAndSelect('client.branch', 'branch')
      .getMany();

    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);

    const par30Principal = this.round2(
      installments
        .filter((row) => {
          const branchId = ((row.loan as any)?.client as any)?.branch?.id;
          if (user?.role !== 'admin' && branchId !== user?.branch) return false;
          const due = new Date(`${row.dueDate}T00:00:00.000Z`);
          return due <= threshold && row.status !== 'paid';
        })
        .reduce((sum, row) => {
          const outstandingPrincipal = Math.max(0, Number(row.principalDue || 0) - Number(row.principalPaid || 0));
          return sum + outstandingPrincipal;
        }, 0),
    );

    const par30Ratio = grossPortfolio > 0 ? this.round2((par30Principal / grossPortfolio) * 100) : 0;

    const complaints = await this.listComplaints(user);
    const openComplaints = complaints.filter((c) => c.status === 'open' || c.status === 'in_review').length;

    const amlEvents = await this.listAmlEvents(user);
    const openAmlEvents = amlEvents.filter((a) => a.status === 'open' || a.status === 'under_review').length;

    return {
      asOf: new Date().toISOString(),
      activeLoans: scopedLoans.filter((loan) => loan.status === 'active').length,
      overdueLoans: scopedLoans.filter((loan) => loan.status === 'overdue').length,
      defaultedLoans: scopedLoans.filter((loan) => loan.status === 'defaulted').length,
      grossPortfolio,
      par30Principal,
      par30Ratio,
      complaintsOpen: openComplaints,
      amlOpenEvents: openAmlEvents,
      totalKycProfiles: await this.kycRepo.count(),
    };
  }

  async recentAuditLogs(user: any, limit = 50) {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      throw new ForbiddenException('Only admin/manager can view audit logs');
    }

    if (limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be between 1 and 200');
    }

    return this.auditRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
