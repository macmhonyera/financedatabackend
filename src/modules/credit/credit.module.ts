import { Module } from '@nestjs/common';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';
import { CreditScoreModule } from '../credit-score/credit-score.module';

@Module({
  imports: [CreditScoreModule],
  providers: [CreditService],
  controllers: [CreditController],
  exports: [CreditService],
})
export class CreditModule {}
