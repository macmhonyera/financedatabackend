import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

export type LateFeeModel = 'flat' | 'percent_of_installment' | 'percent_of_balance';

export type SystemSettings = {
  general: {
    defaultCurrency: string;
    workingDays: string[];
    workingHours: { start: string; end: string };
    timezone: string;
    fiscalYearStartMonth: number;
  };
  penalties: {
    gracePeriodDays: number;
    lateFeeModel: LateFeeModel;
    lateFeeAmount: number;
    lateFeePercent: number;
    penaltyInterestAnnualPercent: number;
    capLateFeesAtInstallment: boolean;
  };
  approval: {
    autoApproveUnder: number;
    managerApprovalUnder: number;
    directorApprovalAbove: number;
    requireDualApproval: boolean;
  };
  provisioning: {
    par1to30Percent: number;
    par31to60Percent: number;
    par61to90Percent: number;
    par90PlusPercent: number;
  };
  notifications: {
    channels: { sms: boolean; whatsapp: boolean; email: boolean };
    reminderDaysBeforeDue: number[];
    overdueReminderCadenceDays: number;
    aiRecoveryEnabled: boolean;
  };
  holidays: string[];
};

const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    defaultCurrency: 'USD',
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    workingHours: { start: '08:00', end: '17:00' },
    timezone: 'Africa/Harare',
    fiscalYearStartMonth: 1,
  },
  penalties: {
    gracePeriodDays: 3,
    lateFeeModel: 'percent_of_installment',
    lateFeeAmount: 0,
    lateFeePercent: 5,
    penaltyInterestAnnualPercent: 24,
    capLateFeesAtInstallment: true,
  },
  approval: {
    autoApproveUnder: 0,
    managerApprovalUnder: 5000,
    directorApprovalAbove: 5000,
    requireDualApproval: false,
  },
  provisioning: {
    par1to30Percent: 5,
    par31to60Percent: 25,
    par61to90Percent: 50,
    par90PlusPercent: 100,
  },
  notifications: {
    channels: { sms: true, whatsapp: true, email: false },
    reminderDaysBeforeDue: [3, 1],
    overdueReminderCadenceDays: 3,
    aiRecoveryEnabled: true,
  },
  holidays: [],
};

type ReportRole = 'admin' | 'manager' | 'loan_officer' | 'collector';
type ReportType =
  | 'portfolio'
  | 'collections'
  | 'financial'
  | 'clients'
  | 'compliance'
  | 'operations'
  | 'products'
  | 'credit'
  | 'notifications';

type ReportCatalogItem = {
  code: string;
  name: string;
  description: string;
  endpoint: string;
  format: 'pdf';
  type: ReportType;
  roles: ReportRole[];
};

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private readonly defaultBranding = {
    companyName: 'MicroFinance Pro',
    primary: '30 58 138',
    accent: '20 184 166',
  };

  private parseCsv(input: string | undefined, fallback: string[]) {
    const parsed = String(input || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return parsed.length > 0 ? parsed : fallback;
  }

  getPaymentChannels() {
    const channels = this.parseCsv(process.env.PAYMENT_CHANNELS, [
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
    ]);

    return channels.map((code) => ({
      code,
      label: code
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
    }));
  }

  getSupportedCurrencies() {
    return this.parseCsv(process.env.SUPPORTED_CURRENCIES, ['USD', 'ZIG']).map((code) => ({
      code: code.toUpperCase(),
      label: code.toUpperCase(),
    }));
  }

  private normalizeRgbTriplet(input: string, fallback: string) {
    const values = String(input || '')
      .trim()
      .split(/\s+/)
      .map((token) => Number(token));

    if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
      return fallback;
    }

    return values
      .map((value) => Math.max(0, Math.min(255, Math.round(value))))
      .join(' ');
  }

  private mapCompanyProfile(organization: Organization) {
    return {
      organizationId: organization.id,
      companyName: organization.name || this.defaultBranding.companyName,
      primary: organization.primaryColor || this.defaultBranding.primary,
      accent: organization.accentColor || this.defaultBranding.accent,
      logo: organization.logoUrl || null,
      updatedAt: organization.updatedAt,
    };
  }

  private async ensureDefaultOrganization() {
    const first = (await this.orgRepo.find({ order: { createdAt: 'ASC' }, take: 1 }))[0];
    if (first) return first;

    const created = this.orgRepo.create({
      name: this.defaultBranding.companyName,
      primaryColor: this.defaultBranding.primary,
      accentColor: this.defaultBranding.accent,
    });
    return this.orgRepo.save(created);
  }

  private async resolveOrganizationForUser(user: any) {
    const userId = String(user?.id || '').trim();
    const tokenOrganizationId = String(user?.organization || '').trim();

    if (tokenOrganizationId) {
      const fromToken = await this.orgRepo.findOne({ where: { id: tokenOrganizationId } });
      if (fromToken) return fromToken;
    }

    if (userId) {
      const entity = await this.userRepo.findOne({
        where: { id: userId },
        relations: ['organization'],
      });

      if (entity?.organization) {
        return entity.organization;
      }

      const fallback = await this.ensureDefaultOrganization();

      if (entity && !entity.organization) {
        entity.organization = fallback;
        await this.userRepo.save(entity);
      }

      return fallback;
    }

    return this.ensureDefaultOrganization();
  }

  async getCompanyProfile(user: any) {
    const organization = await this.resolveOrganizationForUser(user);
    return this.mapCompanyProfile(organization);
  }

  async updateCompanyProfile(user: any, updates: UpdateCompanyProfileDto) {
    const organization = await this.resolveOrganizationForUser(user);

    if (updates.companyName !== undefined) {
      const trimmed = updates.companyName.trim();
      if (trimmed.length > 0) {
        organization.name = trimmed;
      }
    }

    if (updates.primary !== undefined) {
      organization.primaryColor = this.normalizeRgbTriplet(
        updates.primary,
        organization.primaryColor || this.defaultBranding.primary,
      );
    }

    if (updates.accent !== undefined) {
      organization.accentColor = this.normalizeRgbTriplet(
        updates.accent,
        organization.accentColor || this.defaultBranding.accent,
      );
    }

    if (updates.logo !== undefined) {
      const logo = updates.logo.trim();
      organization.logoUrl = logo.length > 0 ? logo : null;
    }

    const saved = await this.orgRepo.save(organization);
    return this.mapCompanyProfile(saved);
  }

  private mergeSettings(stored: Record<string, unknown> | null | undefined): SystemSettings {
    const safeStored = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
    const merged: SystemSettings = {
      general: {
        ...DEFAULT_SETTINGS.general,
        ...(safeStored.general || {}),
        workingHours: {
          ...DEFAULT_SETTINGS.general.workingHours,
          ...((safeStored.general && safeStored.general.workingHours) || {}),
        },
        workingDays: Array.isArray(safeStored.general?.workingDays)
          ? safeStored.general.workingDays
          : DEFAULT_SETTINGS.general.workingDays,
      },
      penalties: { ...DEFAULT_SETTINGS.penalties, ...(safeStored.penalties || {}) },
      approval: { ...DEFAULT_SETTINGS.approval, ...(safeStored.approval || {}) },
      provisioning: { ...DEFAULT_SETTINGS.provisioning, ...(safeStored.provisioning || {}) },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(safeStored.notifications || {}),
        channels: {
          ...DEFAULT_SETTINGS.notifications.channels,
          ...((safeStored.notifications && safeStored.notifications.channels) || {}),
        },
        reminderDaysBeforeDue: Array.isArray(safeStored.notifications?.reminderDaysBeforeDue)
          ? safeStored.notifications.reminderDaysBeforeDue
          : DEFAULT_SETTINGS.notifications.reminderDaysBeforeDue,
      },
      holidays: Array.isArray(safeStored.holidays) ? safeStored.holidays : [],
    };
    return merged;
  }

  async getSystemSettings(user: any) {
    const organization = await this.resolveOrganizationForUser(user);
    return this.mergeSettings(organization.settings as Record<string, unknown> | null | undefined);
  }

  async updateSystemSettings(user: any, dto: UpdateSystemSettingsDto) {
    const organization = await this.resolveOrganizationForUser(user);
    const current = this.mergeSettings(organization.settings as Record<string, unknown> | null | undefined);

    const next: SystemSettings = {
      general: {
        ...current.general,
        ...(dto.general || {}),
        workingHours: {
          ...current.general.workingHours,
          ...((dto.general && dto.general.workingHours) || {}),
        },
        workingDays: dto.general?.workingDays ?? current.general.workingDays,
      },
      penalties: {
        ...current.penalties,
        ...(dto.penalties || {}),
        lateFeeModel: ((dto.penalties?.lateFeeModel as LateFeeModel | undefined) ??
          current.penalties.lateFeeModel),
      },
      approval: { ...current.approval, ...(dto.approval || {}) },
      provisioning: { ...current.provisioning, ...(dto.provisioning || {}) },
      notifications: {
        ...current.notifications,
        ...(dto.notifications || {}),
        channels: {
          ...current.notifications.channels,
          ...((dto.notifications && dto.notifications.channels) || {}),
        },
        reminderDaysBeforeDue:
          dto.notifications?.reminderDaysBeforeDue ?? current.notifications.reminderDaysBeforeDue,
      },
      holidays: dto.holidays ?? current.holidays,
    };

    organization.settings = next as unknown as Record<string, unknown>;
    await this.orgRepo.save(organization);
    return next;
  }

  getReportCatalog() {
    // Curated for admins / top management — executive-level decision-making only.
    // Operational, configuration and per-user reports are intentionally excluded.
    const reports: ReportCatalogItem[] = [
      {
        code: 'portfolio_summary',
        name: 'Portfolio Summary',
        description:
          'Executive snapshot: gross portfolio, status mix, PAR buckets, default and overdue rates.',
        endpoint: '/loans/portfolio/summary',
        format: 'pdf',
        type: 'portfolio',
        roles: ['admin', 'manager'],
      },
      {
        code: 'payments_register',
        name: 'Cash Flow & Receipts',
        description:
          'Repayments collected — totals, daily trend, channel mix and reconciliation rate.',
        endpoint: '/payments',
        format: 'pdf',
        type: 'financial',
        roles: ['admin', 'manager'],
      },
      {
        code: 'regulatory_metrics',
        name: 'Compliance Health',
        description:
          'Board-level compliance snapshot: PAR 30, KYC verified rate, open complaints and AML events.',
        endpoint: '/compliance/metrics/regulatory',
        format: 'pdf',
        type: 'compliance',
        roles: ['admin', 'manager'],
      },
      {
        code: 'credit_score_history',
        name: 'Origination Quality',
        description: 'Credit score distribution for approved loans — lending discipline indicator.',
        endpoint: '/credit/history',
        format: 'pdf',
        type: 'credit',
        roles: ['admin', 'manager'],
      },
      {
        code: 'aml_events_register',
        name: 'AML / CFT Watchlist',
        description: 'Suspicious activity and AML events — frequency and category breakdown.',
        endpoint: '/compliance/aml-events',
        format: 'pdf',
        type: 'compliance',
        roles: ['admin', 'manager'],
      },
      {
        code: 'audit_log',
        name: 'Governance & Audit',
        description: 'Recent privileged actions across the system — for board oversight.',
        endpoint: '/compliance/audit?limit=200',
        format: 'pdf',
        type: 'operations',
        roles: ['admin', 'manager'],
      },
    ];

    return reports;
  }
}
