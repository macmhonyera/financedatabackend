import { Injectable } from '@nestjs/common';

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
