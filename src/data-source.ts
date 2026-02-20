import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();
import { User } from './entities/user.entity';
import { Branch } from './entities/branch.entity';
import { Client } from './entities/client.entity';
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

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT) || 5432,
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'finance_dev',
  entities: [
    User,
    Branch,
    Client,
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
  ],
  migrations: ['dist/migrations/*{.ts,.js}'],
});

export default AppDataSource;
