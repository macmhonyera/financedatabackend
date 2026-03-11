import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

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

  getReportCatalog() {
    const reports: ReportCatalogItem[] = [
      {
        code: 'portfolio_summary',
        name: 'Portfolio Summary',
        description: 'Portfolio balances, active/overdue/defaulted counts, PAR buckets.',
        endpoint: '/loans/portfolio/summary',
        format: 'pdf',
        type: 'portfolio',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'loan_register',
        name: 'Loan Register',
        description: 'Detailed list of loans, status, terms, balances and branch ownership.',
        endpoint: '/loans',
        format: 'pdf',
        type: 'portfolio',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'collections_due_today',
        name: 'Collections Due Today',
        description:
          'Installments due today for field collections, with client and branch details.',
        endpoint: '/loans/collections/due-today',
        format: 'pdf',
        type: 'collections',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'payments_register',
        name: 'Payments Register',
        description:
          'Repayment transactions by date, amount, channel, branch and reconciliation status.',
        endpoint: '/payments',
        format: 'pdf',
        type: 'financial',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'clients_register',
        name: 'Client Register',
        description: 'Client master list with branch, risk/collection status and officer assignment.',
        endpoint: '/clients',
        format: 'pdf',
        type: 'clients',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'branch_directory',
        name: 'Branch Directory',
        description: 'Branch list for current user scope, including active status and management info.',
        endpoint: '/branches',
        format: 'pdf',
        type: 'operations',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'audit_log',
        name: 'Audit Trail',
        description: 'Recent audit log entries for compliance and operational oversight.',
        endpoint: '/compliance/audit?limit=200',
        format: 'pdf',
        type: 'operations',
        roles: ['admin', 'manager'],
      },
      {
        code: 'loan_products_catalog',
        name: 'Loan Product Catalog',
        description: 'Loan products, pricing and policy limits used by credit operations.',
        endpoint: '/loan-products?includeInactive=true',
        format: 'pdf',
        type: 'products',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'credit_score_history',
        name: 'Credit Score History',
        description: 'Historical credit scoring outcomes for approved/scored applications.',
        endpoint: '/credit/history',
        format: 'pdf',
        type: 'credit',
        roles: ['admin', 'manager', 'loan_officer'],
      },
      {
        code: 'credit_model_health',
        name: 'Credit Model Health',
        description: 'Operational health and output diagnostics for the scoring model.',
        endpoint: '/credit/model-health',
        format: 'pdf',
        type: 'credit',
        roles: ['admin', 'manager', 'loan_officer'],
      },
      {
        code: 'regulatory_metrics',
        name: 'Regulatory Metrics',
        description: 'Compliance snapshot with PAR30, complaints, AML and KYC metrics.',
        endpoint: '/compliance/metrics/regulatory',
        format: 'pdf',
        type: 'compliance',
        roles: ['admin', 'manager'],
      },
      {
        code: 'complaints_register',
        name: 'Complaints Register',
        description: 'Customer complaints log with status tracking for service compliance.',
        endpoint: '/compliance/complaints',
        format: 'pdf',
        type: 'compliance',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
      {
        code: 'aml_events_register',
        name: 'AML/CFT Events',
        description: 'Suspicious activity and AML event log for compliance monitoring.',
        endpoint: '/compliance/aml-events',
        format: 'pdf',
        type: 'compliance',
        roles: ['admin', 'manager'],
      },
      {
        code: 'notification_queue',
        name: 'Notification Delivery Queue',
        description: 'Notification queue with status, retries and delivery outcomes.',
        endpoint: '/notifications',
        format: 'pdf',
        type: 'notifications',
        roles: ['admin', 'manager'],
      },
      {
        code: 'notification_templates',
        name: 'Notification Templates',
        description: 'Configured notification templates used for SMS/email/in-app communication.',
        endpoint: '/notifications/templates?includeInactive=true',
        format: 'pdf',
        type: 'notifications',
        roles: ['admin', 'manager'],
      },
      {
        code: 'my_notifications',
        name: 'My In-App Notifications',
        description: 'In-app notification feed for the currently logged-in user.',
        endpoint: '/notifications/my',
        format: 'pdf',
        type: 'notifications',
        roles: ['admin', 'manager', 'loan_officer', 'collector'],
      },
    ];

    return reports;
  }
}
