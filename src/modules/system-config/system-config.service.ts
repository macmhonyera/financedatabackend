import { Injectable } from '@nestjs/common';

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
    return [
      {
        code: 'portfolio_summary',
        name: 'Portfolio Summary',
        description: 'Portfolio balances, active/overdue/defaulted counts, PAR buckets.',
        endpoint: '/loans/portfolio/summary',
        format: 'json',
      },
      {
        code: 'regulatory_metrics',
        name: 'Regulatory Metrics',
        description: 'Compliance snapshot with PAR30, complaints, AML and KYC metrics.',
        endpoint: '/compliance/metrics/regulatory',
        format: 'json',
      },
      {
        code: 'audit_log',
        name: 'Audit Trail',
        description: 'Recent compliance audit trail entries for operational oversight.',
        endpoint: '/compliance/audit?limit=100',
        format: 'json',
      },
      {
        code: 'loan_products',
        name: 'Loan Product Catalog',
        description: 'Loan products and policy limits used by credit operations.',
        endpoint: '/loan-products?includeInactive=true',
        format: 'json',
      },
    ];
  }
}
