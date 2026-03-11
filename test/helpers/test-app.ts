import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as request from 'supertest';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { SeedModule } from '../../src/modules/seed/seed.module';
import { ClientsModule } from '../../src/modules/clients/clients.module';
import { ClientAssetsModule } from '../../src/modules/client-assets/client-assets.module';
import { LoansModule } from '../../src/modules/loans/loans.module';
import { PaymentsModule } from '../../src/modules/payments/payments.module';
import { CreditModule } from '../../src/modules/credit/credit.module';
import { LoanProductsModule } from '../../src/modules/loan-products/loan-products.module';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { CreditScoreModule } from '../../src/modules/credit-score/credit-score.module';
import { AiRecoveryAgentModule } from '../../src/modules/ai-recovery-agent/ai-recovery-agent.module';
import { SystemConfigModule } from '../../src/modules/system-config/system-config.module';
import { User } from '../../src/entities/user.entity';
import { Branch } from '../../src/entities/branch.entity';
import { Organization } from '../../src/entities/organization.entity';
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
import { CreditScoreResult } from '../../src/modules/credit-score/scoring.entity';
import { SeedService } from '../../src/modules/seed/seed.service';
import { BorrowerMessage } from '../../src/entities/borrower-message.entity';
import { PaymentPromise } from '../../src/entities/payment-promise.entity';
import { RecoveryAction } from '../../src/entities/recovery-action.entity';

export const TEST_ENTITIES = [
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
];

export async function createTestingApp(): Promise<{ app: INestApplication; moduleRef: TestingModule }> {
  process.env.SMS_PROVIDER = 'log';
  process.env.MAIL_PROVIDER = 'log';

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ScheduleModule.forRoot(),
      TypeOrmModule.forRoot({
        type: 'sqlite',
        database: ':memory:',
        dropSchema: true,
        entities: TEST_ENTITIES,
        synchronize: true,
      }),
      AuthModule,
      UsersModule,
      SeedModule,
      ClientsModule,
      ClientAssetsModule,
      LoansModule,
      PaymentsModule,
      CreditModule,
      CreditScoreModule,
      LoanProductsModule,
      NotificationsModule,
      SystemConfigModule,
      AiRecoveryAgentModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app, moduleRef };
}

export async function seedDatabase(moduleRef: TestingModule) {
  const seed = moduleRef.get(SeedService);
  return seed.run();
}

export async function loginAndGetToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(201);

  return response.body.access_token;
}
