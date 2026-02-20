import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();
import { Branch } from './src/entities/branch.entity';
import { User } from './src/entities/user.entity';
import { Client } from './src/entities/client.entity';
import { Loan } from './src/entities/loan.entity';
import { Payment } from './src/entities/payment.entity';
import { LoanProduct } from './src/entities/loan-product.entity';
import { LoanInstallment } from './src/entities/loan-installment.entity';
import { KycProfile } from './src/entities/kyc-profile.entity';
import { Complaint } from './src/entities/complaint.entity';
import { AmlEvent } from './src/entities/aml-event.entity';
import { AuditLog } from './src/entities/audit-log.entity';
import { NotificationTemplate } from './src/entities/notification-template.entity';
import { Notification } from './src/entities/notification.entity';
import { SeedService } from './src/modules/seed/seed.service';

async function run() {
  const dataSource = new DataSource({
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
      LoanProduct,
      LoanInstallment,
      KycProfile,
      Complaint,
      AmlEvent,
      AuditLog,
      NotificationTemplate,
      Notification,
    ],
    synchronize: true,
  });

  await dataSource.initialize();
  const seed = new SeedService(dataSource as any);
  const result = await seed.run();
  console.log('Seed result:', result);
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
