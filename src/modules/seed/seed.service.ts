import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Branch } from '../../entities/branch.entity';
import { User } from '../../entities/user.entity';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { Payment } from '../../entities/payment.entity';
import { LoanProduct } from '../../entities/loan-product.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import { KycProfile } from '../../entities/kyc-profile.entity';
import { Complaint } from '../../entities/complaint.entity';
import { AmlEvent } from '../../entities/aml-event.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { NotificationTemplate } from '../../entities/notification-template.entity';
import { Notification } from '../../entities/notification.entity';

@Injectable()
export class SeedService {
  constructor(private dataSource: DataSource) {}

  async run() {
    const repoBranch = this.dataSource.getRepository(Branch);
    const repoUser = this.dataSource.getRepository(User);
    const repoClient = this.dataSource.getRepository(Client);
    const repoLoan = this.dataSource.getRepository(Loan);
    const repoPayment = this.dataSource.getRepository(Payment);
    const repoLoanProduct = this.dataSource.getRepository(LoanProduct);
    const repoLoanInstallment = this.dataSource.getRepository(LoanInstallment);
    const repoKyc = this.dataSource.getRepository(KycProfile);
    const repoComplaint = this.dataSource.getRepository(Complaint);
    const repoAml = this.dataSource.getRepository(AmlEvent);
    const repoAudit = this.dataSource.getRepository(AuditLog);
    const repoNotificationTemplate = this.dataSource.getRepository(NotificationTemplate);
    const repoNotification = this.dataSource.getRepository(Notification);

    // Clear database (supports both Postgres and sqlite tests)
    const dbType = (this.dataSource.options as any)?.type;
    if (dbType === 'postgres') {
      await this.dataSource.query(`
        TRUNCATE TABLE
          notification,
          notification_template,
          audit_log,
          aml_event,
          complaint,
          kyc_profile,
          payment,
          loan_installment,
          loan,
          loan_product,
          client,
          "user",
          branch
        RESTART IDENTITY CASCADE;
      `);
    } else {
      await repoNotification.clear();
      await repoNotificationTemplate.clear();
      await repoAudit.clear();
      await repoAml.clear();
      await repoComplaint.clear();
      await repoKyc.clear();
      await repoPayment.clear();
      await repoLoanInstallment.clear();
      await repoLoan.clear();
      await repoLoanProduct.clear();
      await repoClient.clear();
      await repoUser.clear();
      await repoBranch.clear();
    }

    // ----------------------------
    // Branches
    // ----------------------------
    const br1 = repoBranch.create({ id: 'BR001', name: 'Harare' });
    const br2 = repoBranch.create({ id: 'BR002', name: 'Bulawayo' });
    await repoBranch.save([br1, br2]);

    // ----------------------------
    // Loan products
    // ----------------------------
    const products = repoLoanProduct.create([
      {
        code: 'SALARY-3M',
        name: 'Salary Advance 3M',
        description: 'Short-term salary based product',
        currency: 'USD',
        minAmount: 100,
        maxAmount: 1500,
        termMonths: 3,
        repaymentFrequency: 'monthly',
        interestRateAnnual: 24,
        processingFeeRate: 2,
        lateFeeRate: 1,
        gracePeriodDays: 3,
        scheduleType: 'reducing',
        isActive: true,
      },
      {
        code: 'SME-6M',
        name: 'SME Working Capital 6M',
        description: 'Weekly repayments for small businesses',
        currency: 'USD',
        minAmount: 500,
        maxAmount: 10000,
        termMonths: 6,
        repaymentFrequency: 'weekly',
        interestRateAnnual: 28,
        processingFeeRate: 1.5,
        lateFeeRate: 1.5,
        gracePeriodDays: 2,
        scheduleType: 'flat',
        isActive: true,
      },
    ] as any);
    const savedProducts = await repoLoanProduct.save(products as any);

    const templates = repoNotificationTemplate.create([
      {
        code: 'LOAN_APPROVED_SMS',
        channel: 'sms',
        bodyTemplate:
          'Hello {{clientName}}, your loan {{loanId}} was approved. Installment starts on {{firstDueDate}}.',
        isActive: true,
      },
      {
        code: 'PAYMENT_RECEIPT_EMAIL',
        channel: 'email',
        subjectTemplate: 'Payment Receipt - Loan {{loanId}}',
        bodyTemplate: 'Dear {{clientName}}, we received your payment of {{amount}}. Thank you.',
        isActive: true,
      },
    ] as any);
    const savedTemplates = await repoNotificationTemplate.save(templates as any);

    // ----------------------------
    // Users
    // ----------------------------
    const hash = (p: string) => bcrypt.hashSync(p, 10);

    const users: Partial<User>[] = [
      {
        email: 'admin@example.com',
        name: 'Admin',
        passwordHash: hash('admin123'),
        role: 'admin',
      },
      {
        email: 'manager@harare.com',
        name: 'ManagerHarare',
        passwordHash: hash('manager123'),
        role: 'manager',
        branch: br1,
      },
      {
        email: 'manager@bulawayo.com',
        name: 'ManagerBulawayo',
        passwordHash: hash('manager123'),
        role: 'manager',
        branch: br2,
      },
      {
        email: 'officer@harare.com',
        name: 'OfficerHarare',
        passwordHash: hash('officer123'),
        role: 'loan_officer',
        branch: br1,
      },
    ];

    const createdUsers = repoUser.create(users as any);
    await repoUser.save(createdUsers as any);

    // ----------------------------
    // Clients (generate bulk)
    // ----------------------------
    const clientCount = 60;
    const clientData: Partial<Client>[] = [];

    for (let i = 1; i <= clientCount; i++) {
      const branch = i % 2 === 0 ? br1 : br2;

      clientData.push({
        name: `Client ${i}`,
        phone: `0777${String(100000 + i).slice(-6)}`,
        status: Math.random() > 0.1 ? 'active' : 'inactive',
        branch: branch,
      });
    }

    const clients = repoClient.create(clientData as any);
    const savedClients = await repoClient.save(clients as any);

    // ----------------------------
    // Loans (1 loan per client)
    // ----------------------------
    const loanData: Partial<Loan>[] = [];

    for (let i = 0; i < savedClients.length; i++) {
      const amount = Math.floor(200 + Math.random() * 5000);
      const paid = Math.floor(Math.random() * amount);
      const balance = amount - paid;
      const product = savedProducts[i % savedProducts.length];

      loanData.push({
        amount,
        balance,
        status: balance > 0 ? 'active' : 'completed',
        client: { id: savedClients[i].id } as any, // ✅ FK safe
        product: { id: (product as any).id } as any,
        currency: (product as any).currency,
        termMonths: (product as any).termMonths,
        interestRateAnnual: (product as any).interestRateAnnual,
        repaymentFrequency: (product as any).repaymentFrequency,
        disbursedAt: new Date(),
      });
    }

    const loans = repoLoan.create(loanData as any);
    const savedLoans = await repoLoan.save(loans as any);

    // ----------------------------
    // Payments (1-4 payments per loan)
    // ----------------------------
    const paymentData: Partial<Payment>[] = [];

    for (let i = 0; i < savedLoans.length; i++) {
      const loan = savedLoans[i];

      // branch id derived from client branch
      const clientId = (loan.client as any)?.id;

      const clientBranch =
        savedClients.find((c) => c.id === clientId)?.branch || br1;

      const branchId = (clientBranch as any).id;

      const paymentCount = 1 + Math.floor(Math.random() * 4);

      for (let p = 0; p < paymentCount; p++) {
        paymentData.push({
          amount: Math.floor(50 + Math.random() * 500),
          loan: { id: loan.id } as any,
          client: { id: clientId } as any,
          branch: branchId,
        });
      }
    }

    const payments = repoPayment.create(paymentData as any);
    const savedPayments = await repoPayment.save(payments as any);

    return {
      branches: 2,
      users: users.length,
      clients: savedClients.length,
      loans: savedLoans.length,
      payments: savedPayments.length,
      products: savedProducts.length,
      notificationTemplates: savedTemplates.length,
    };
  }
}
