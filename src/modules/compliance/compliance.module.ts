import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycProfile } from '../../entities/kyc-profile.entity';
import { Complaint } from '../../entities/complaint.entity';
import { AmlEvent } from '../../entities/aml-event.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycProfile, Complaint, AmlEvent, AuditLog, Client, Loan, LoanInstallment]),
  ],
  providers: [ComplianceService],
  controllers: [ComplianceController],
  exports: [ComplianceService],
})
export class ComplianceModule {}
