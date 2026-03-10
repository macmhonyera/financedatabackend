import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/entities/user.entity';
import { Branch } from '../../src/entities/branch.entity';
import { Client } from '../../src/entities/client.entity';
import { ClientAsset } from '../../src/entities/client-asset.entity';
import { Loan } from '../../src/entities/loan.entity';
import { Payment } from '../../src/entities/payment.entity';
import { LoanProduct } from '../../src/entities/loan-product.entity';
import { LoanInstallment } from '../../src/entities/loan-installment.entity';
import { KycProfile } from '../../src/entities/kyc-profile.entity';
import { Complaint } from '../../src/entities/complaint.entity';
import { AmlEvent } from '../../src/entities/aml-event.entity';
import { AuditLog } from '../../src/entities/audit-log.entity';
import { NotificationTemplate } from '../../src/entities/notification-template.entity';
import { Notification } from '../../src/entities/notification.entity';
import { BorrowerMessage } from '../../src/entities/borrower-message.entity';
import { PaymentPromise } from '../../src/entities/payment-promise.entity';
import { RecoveryAction } from '../../src/entities/recovery-action.entity';

describe('E2E App', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [
            User,
            Branch,
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
            BorrowerMessage,
            PaymentPromise,
            RecoveryAction,
          ],
          synchronize: true,
        }),
        AppModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/login should fail with wrong creds', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'no@one', password: 'x' }).expect(401);
  });
});
