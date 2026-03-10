import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { BorrowerMessage } from '../../entities/borrower-message.entity';
import { PaymentPromise } from '../../entities/payment-promise.entity';
import { RecoveryAction } from '../../entities/recovery-action.entity';
import { User } from '../../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiRecoveryAgentService } from './ai-recovery-agent.service';
import { AiRecoveryAgentController } from './ai-recovery-agent.controller';
import { AiRecoveryAgentProcessor } from './ai-recovery-agent.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      Loan,
      LoanInstallment,
      BorrowerMessage,
      PaymentPromise,
      RecoveryAction,
      User,
    ]),
    NotificationsModule,
  ],
  providers: [AiRecoveryAgentService, AiRecoveryAgentProcessor],
  controllers: [AiRecoveryAgentController],
  exports: [AiRecoveryAgentService],
})
export class AiRecoveryAgentModule {}
