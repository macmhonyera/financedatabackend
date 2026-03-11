import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Branch } from '../src/entities/branch.entity';
import { Organization } from '../src/entities/organization.entity';
import { User } from '../src/entities/user.entity';
import { Client } from '../src/entities/client.entity';
import { ClientAsset } from '../src/entities/client-asset.entity';
import { Loan } from '../src/entities/loan.entity';
import { Payment } from '../src/entities/payment.entity';
import { LoanProduct } from '../src/entities/loan-product.entity';
import { LoanInstallment } from '../src/entities/loan-installment.entity';
import { KycProfile } from '../src/entities/kyc-profile.entity';
import { Complaint } from '../src/entities/complaint.entity';
import { AmlEvent } from '../src/entities/aml-event.entity';
import { AuditLog } from '../src/entities/audit-log.entity';
import { NotificationTemplate } from '../src/entities/notification-template.entity';
import { Notification } from '../src/entities/notification.entity';
import { CreditScoreResult } from '../src/modules/credit-score/scoring.entity';
import { SeedService } from '../src/modules/seed/seed.service';
import { BorrowerMessage } from '../src/entities/borrower-message.entity';
import { PaymentPromise } from '../src/entities/payment-promise.entity';
import { RecoveryAction } from '../src/entities/recovery-action.entity';

describe('SeedService', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      dropSchema: true,
      entities: [
        User,
        Branch,
        Organization,
        Client,
        ClientAsset,
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
        CreditScoreResult,
        BorrowerMessage,
        PaymentPromise,
        RecoveryAction,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('runs seed and creates data', async () => {
    const seed = new SeedService(dataSource as any);
    const r = await seed.run();
    expect(r.branches).toBe(2);
    expect(r.users).toBeGreaterThanOrEqual(1);
    expect(r.clients).toBeGreaterThanOrEqual(1);
  });
});
