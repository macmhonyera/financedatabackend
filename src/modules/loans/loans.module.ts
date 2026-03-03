import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from '../../entities/loan.entity';
import { Client } from '../../entities/client.entity';
import { ClientAsset } from '../../entities/client-asset.entity';
import { LoanProduct } from '../../entities/loan-product.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { CreditModule } from '../credit/credit.module';
import { LoanProductsModule } from '../loan-products/loan-products.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, Client, ClientAsset, LoanProduct, LoanInstallment]),
    CreditModule,
    LoanProductsModule,
    NotificationsModule,
  ],
  providers: [LoansService],
  controllers: [LoansController],
  exports: [LoansService],
})
export class LoansModule {}
