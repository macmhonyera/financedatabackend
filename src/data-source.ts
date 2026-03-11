import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();
import { User } from './entities/user.entity';
import { Branch } from './entities/branch.entity';
import { Organization } from './entities/organization.entity';
import { Client } from './entities/client.entity';
import { ClientAsset } from './entities/client-asset.entity';
import { Loan } from './entities/loan.entity';
import { Payment } from './entities/payment.entity';
import { CreditScore } from './modules/credit/credit.entity';
import { LoanProduct } from './entities/loan-product.entity';
import { LoanInstallment } from './entities/loan-installment.entity';
import { KycProfile } from './entities/kyc-profile.entity';
import { Complaint } from './entities/complaint.entity';
import { AmlEvent } from './entities/aml-event.entity';
import { AuditLog } from './entities/audit-log.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { Notification } from './entities/notification.entity';
import { BorrowerMessage } from './entities/borrower-message.entity';
import { PaymentPromise } from './entities/payment-promise.entity';
import { RecoveryAction } from './entities/recovery-action.entity';

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

const databaseHost = process.env.DATABASE_HOST || 'localhost';
const databaseUrl = process.env.DATABASE_URL || undefined;
const hasSupabaseHost = databaseHost.includes('supabase.co') || (databaseUrl || '').includes('supabase.co');
const hasSslInUrl = (databaseUrl || '').includes('sslmode=require');
const useSsl = parseBoolean(process.env.DATABASE_SSL) ?? (hasSupabaseHost || hasSslInUrl);

const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  host: databaseUrl ? undefined : databaseHost,
  port: databaseUrl ? undefined : Number(process.env.DATABASE_PORT) || 5432,
  username: databaseUrl ? undefined : process.env.DATABASE_USER || 'postgres',
  password: databaseUrl ? undefined : process.env.DATABASE_PASSWORD || 'password',
  database: databaseUrl ? undefined : process.env.DATABASE_NAME || 'finance_dev',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  entities: [
    User,
    Branch,
    Organization,
    Client,
    ClientAsset,
    Loan,
    Payment,
    CreditScore,
    LoanProduct,
    LoanInstallment,
    KycProfile,
    Complaint,
    AmlEvent,
    AuditLog,
    NotificationTemplate,
    Notification,
    BorrowerMessage,
    PaymentPromise,
    RecoveryAction,
  ],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
});

export default AppDataSource;
