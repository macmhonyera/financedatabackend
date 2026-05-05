import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentPromise } from '../../entities/payment-promise.entity';
import { RecoveryAction } from '../../entities/recovery-action.entity';
import { FieldVisit } from '../../entities/field-visit.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      Loan,
      LoanInstallment,
      Payment,
      PaymentPromise,
      RecoveryAction,
      FieldVisit,
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
