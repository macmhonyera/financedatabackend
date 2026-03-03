import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SeedModule } from './modules/seed/seed.module';
import { ClientsModule } from './modules/clients/clients.module';
import { LoansModule } from './modules/loans/loans.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RolesGuard } from './common/roles.guard';
import { User } from './entities/user.entity';
import { Branch } from './entities/branch.entity';
import { Client } from './entities/client.entity';
import { ClientAsset } from './entities/client-asset.entity';
import { Loan } from './entities/loan.entity';
import { Payment } from './entities/payment.entity';
import { CreditScore } from './modules/credit/credit.entity';
import { CreditModule } from './modules/credit/credit.module';
import { LoanProduct } from './entities/loan-product.entity';
import { LoanInstallment } from './entities/loan-installment.entity';
import { LoanProductsModule } from './modules/loan-products/loan-products.module';
import { KycProfile } from './entities/kyc-profile.entity';
import { Complaint } from './entities/complaint.entity';
import { AmlEvent } from './entities/aml-event.entity';
import { AuditLog } from './entities/audit-log.entity';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { NotificationTemplate } from './entities/notification-template.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ClientAssetsModule } from './modules/client-assets/client-assets.module';
import { BranchesModule } from './modules/branches/branches.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
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
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: false,
    }),
    AuthModule,
    UsersModule,
    ClientsModule,
    ClientAssetsModule,
    LoansModule,
    PaymentsModule,
    SeedModule,
    CreditModule,
    LoanProductsModule,
    ComplianceModule,
    NotificationsModule,
    BranchesModule,
    SystemConfigModule,
  ],
  providers: [RolesGuard],
})
export class AppModule {}
