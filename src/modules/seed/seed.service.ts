import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Branch } from '../../entities/branch.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { Client } from '../../entities/client.entity';
import { ClientAsset } from '../../entities/client-asset.entity';
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
import { CreditScoreResult } from '../credit-score/scoring.entity';
import { BorrowerMessage } from '../../entities/borrower-message.entity';
import { PaymentPromise } from '../../entities/payment-promise.entity';
import { RecoveryAction } from '../../entities/recovery-action.entity';

@Injectable()
export class SeedService {
  constructor(private dataSource: DataSource) {}

  private round2(value: number) {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  private dateOffset(days: number, hours = 10, minutes = 0) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private dateOnly(input: Date) {
    return input.toISOString().slice(0, 10);
  }

  async run() {
    const repoBranch = this.dataSource.getRepository(Branch);
    const repoOrganization = this.dataSource.getRepository(Organization);
    const repoUser = this.dataSource.getRepository(User);
    const repoClient = this.dataSource.getRepository(Client);
    const repoClientAsset = this.dataSource.getRepository(ClientAsset);
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
    const repoCreditScore = this.dataSource.getRepository(CreditScoreResult);
    const repoBorrowerMessage = this.dataSource.getRepository(BorrowerMessage);
    const repoPaymentPromise = this.dataSource.getRepository(PaymentPromise);
    const repoRecoveryAction = this.dataSource.getRepository(RecoveryAction);

    // Clear database (supports both Postgres and sqlite tests)
    const dbType = (this.dataSource.options as any)?.type;
    if (dbType === 'postgres') {
      const candidates = [
        'notification',
        'notification_template',
        'recovery_actions',
        'payment_promises',
        'borrower_messages',
        'audit_log',
        'aml_event',
        'complaint',
        'kyc_profile',
        'payment',
        'credit_score_results',
        'client_asset',
        'loan_installment',
        'loan',
        'loan_product',
        'client',
        'user',
        'organization',
        'branch',
      ];

      const existing: Array<{ tablename: string }> = await this.dataSource.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
      `);

      const existingNames = new Set(existing.map((row) => row.tablename));
      const toTruncate = candidates.filter((name) => existingNames.has(name));

      if (toTruncate.length > 0) {
        const quoted = toTruncate.map((name) => `"${name}"`).join(', ');
        await this.dataSource.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
      }
    } else {
      await repoNotification.clear();
      await repoNotificationTemplate.clear();
      await repoRecoveryAction.clear();
      await repoPaymentPromise.clear();
      await repoBorrowerMessage.clear();
      await repoAudit.clear();
      await repoAml.clear();
      await repoComplaint.clear();
      await repoKyc.clear();
      await repoCreditScore.clear();
      await repoClientAsset.clear();
      await repoPayment.clear();
      await repoLoanInstallment.clear();
      await repoLoan.clear();
      await repoLoanProduct.clear();
      await repoClient.clear();
      await repoUser.clear();
      await repoOrganization.clear();
      await repoBranch.clear();
    }

    // ----------------------------
    // Organization
    // ----------------------------
    const org = await repoOrganization.save(
      repoOrganization.create({
        name: 'MicroFinance Pro',
        primaryColor: '30 58 138',
        accentColor: '20 184 166',
      }),
    );

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
        organization: org,
      },
      {
        email: 'manager@harare.com',
        name: 'ManagerHarare',
        passwordHash: hash('manager123'),
        role: 'manager',
        branch: br1,
        organization: org,
      },
      {
        email: 'manager@bulawayo.com',
        name: 'ManagerBulawayo',
        passwordHash: hash('manager123'),
        role: 'manager',
        branch: br2,
        organization: org,
      },
      {
        email: 'officer@harare.com',
        name: 'OfficerHarare',
        passwordHash: hash('officer123'),
        role: 'loan_officer',
        branch: br1,
        organization: org,
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

    // ----------------------------
    // Recovery demo dataset (high / medium / low risk borrowers)
    // ----------------------------
    const recoveryBorrowers = await repoClient.save(
      repoClient.create([
        {
          name: 'Recovery Demo - High Risk',
          phone: '+263771700001',
          status: 'active',
          collectionStatus: 'defaulted',
          loanOfficer: 'OfficerHarare',
          branch: br1,
        },
        {
          name: 'Recovery Demo - Medium Risk',
          phone: '+263771700002',
          status: 'active',
          collectionStatus: 'overdue',
          loanOfficer: 'OfficerHarare',
          branch: br1,
        },
        {
          name: 'Recovery Demo - Low Risk',
          phone: '+263771700003',
          status: 'active',
          collectionStatus: 'overdue',
          loanOfficer: 'ManagerBulawayo',
          branch: br2,
        },
      ] as any),
    );

    const [highBorrower, mediumBorrower, lowBorrower] = recoveryBorrowers as unknown as Client[];
    const recoveryProduct = savedProducts[0] as any;

    const recoveryLoans = await repoLoan.save(
      repoLoan.create([
        {
          amount: 1200,
          balance: 810,
          status: 'overdue',
          client: { id: highBorrower.id } as any,
          product: { id: recoveryProduct.id } as any,
          currency: 'USD',
          termMonths: 6,
          interestRateAnnual: 18,
          repaymentFrequency: 'monthly',
          disbursedAt: this.dateOffset(-90, 9),
        },
        {
          amount: 900,
          balance: 540,
          status: 'overdue',
          client: { id: mediumBorrower.id } as any,
          product: { id: recoveryProduct.id } as any,
          currency: 'USD',
          termMonths: 6,
          interestRateAnnual: 16,
          repaymentFrequency: 'monthly',
          disbursedAt: this.dateOffset(-70, 9),
        },
        {
          amount: 700,
          balance: 300,
          status: 'active',
          client: { id: lowBorrower.id } as any,
          product: { id: recoveryProduct.id } as any,
          currency: 'USD',
          termMonths: 5,
          interestRateAnnual: 14,
          repaymentFrequency: 'monthly',
          disbursedAt: this.dateOffset(-45, 9),
        },
      ] as any),
    );

    const [highLoan, mediumLoan, lowLoan] = recoveryLoans as unknown as Loan[];

    const recoveryInstallments = await repoLoanInstallment.save(
      repoLoanInstallment.create([
        {
          loan: { id: highLoan.id } as any,
          installmentNumber: 1,
          dueDate: this.dateOnly(this.dateOffset(-35)),
          principalDue: 180,
          interestDue: 40,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 220,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'overdue',
        },
        {
          loan: { id: highLoan.id } as any,
          installmentNumber: 2,
          dueDate: this.dateOnly(this.dateOffset(-20)),
          principalDue: 180,
          interestDue: 40,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 220,
          principalPaid: 60,
          interestPaid: 10,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'partial',
        },
        {
          loan: { id: highLoan.id } as any,
          installmentNumber: 3,
          dueDate: this.dateOnly(this.dateOffset(-8)),
          principalDue: 180,
          interestDue: 40,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 220,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'overdue',
        },
        {
          loan: { id: highLoan.id } as any,
          installmentNumber: 4,
          dueDate: this.dateOnly(this.dateOffset(15)),
          principalDue: 180,
          interestDue: 40,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 220,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'pending',
        },
        {
          loan: { id: mediumLoan.id } as any,
          installmentNumber: 1,
          dueDate: this.dateOnly(this.dateOffset(-10)),
          principalDue: 150,
          interestDue: 30,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 180,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'overdue',
        },
        {
          loan: { id: mediumLoan.id } as any,
          installmentNumber: 2,
          dueDate: this.dateOnly(this.dateOffset(20)),
          principalDue: 150,
          interestDue: 30,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 180,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'pending',
        },
        {
          loan: { id: mediumLoan.id } as any,
          installmentNumber: 3,
          dueDate: this.dateOnly(this.dateOffset(50)),
          principalDue: 150,
          interestDue: 30,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 180,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'pending',
        },
        {
          loan: { id: lowLoan.id } as any,
          installmentNumber: 1,
          dueDate: this.dateOnly(this.dateOffset(-1)),
          principalDue: 130,
          interestDue: 30,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 160,
          principalPaid: 10,
          interestPaid: 10,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'partial',
        },
        {
          loan: { id: lowLoan.id } as any,
          installmentNumber: 2,
          dueDate: this.dateOnly(this.dateOffset(29)),
          principalDue: 130,
          interestDue: 30,
          feeDue: 0,
          penaltyDue: 0,
          totalDue: 160,
          principalPaid: 0,
          interestPaid: 0,
          feePaid: 0,
          penaltyPaid: 0,
          status: 'pending',
        },
      ] as any),
    );

    const saveBorrowerMessage = async (payload: Partial<BorrowerMessage>) => {
      const saved = await repoBorrowerMessage.save(
        repoBorrowerMessage.create(payload as any),
      );
      return (Array.isArray(saved) ? saved[0] : saved) as BorrowerMessage;
    };

    const highReminder1 = await saveBorrowerMessage({
      borrower: { id: highBorrower.id } as any,
      loan: { id: highLoan.id } as any,
      channel: 'whatsapp',
      direction: 'outbound',
      messageType: 'overdue_notice',
      messageContent:
        'Hello Recovery Demo - High Risk, your payment is overdue by 12 day(s). Please settle your account.',
      status: 'responded',
      metadata: { automated: true, stage: 'overdue_notice' },
      timestamp: this.dateOffset(-12, 11, 15),
    });

    const highReminder2 = await saveBorrowerMessage({
      borrower: { id: highBorrower.id } as any,
      loan: { id: highLoan.id } as any,
      channel: 'whatsapp',
      direction: 'outbound',
      messageType: 'overdue_notice',
      messageContent:
        'Reminder: your account is still overdue. Please make a payment to avoid escalation.',
      status: 'responded',
      metadata: { automated: true, stage: 'overdue_notice' },
      timestamp: this.dateOffset(-8, 10, 30),
    });

    const highInboundPromise = await saveBorrowerMessage({
      borrower: { id: highBorrower.id } as any,
      loan: { id: highLoan.id } as any,
      channel: 'whatsapp',
      direction: 'inbound',
      messageType: 'promise_to_pay',
      messageContent: 'I will pay USD 120 tomorrow.',
      aiResponse: 'Thank you. I have recorded your promise to pay.',
      status: 'responded',
      timestamp: this.dateOffset(-7, 9, 45),
    });

    const highEscalationMessage = await saveBorrowerMessage({
      borrower: { id: highBorrower.id } as any,
      loan: { id: highLoan.id } as any,
      channel: 'whatsapp',
      direction: 'outbound',
      messageType: 'escalation',
      messageContent:
        'Your account has been escalated due to extended overdue status. Our team will contact you.',
      status: 'responded',
      metadata: { automated: true, stage: 'escalation' },
      timestamp: this.dateOffset(-2, 16, 5),
    });

    const mediumReminderToday = await saveBorrowerMessage({
      borrower: { id: mediumBorrower.id } as any,
      loan: { id: mediumLoan.id } as any,
      channel: 'whatsapp',
      direction: 'outbound',
      messageType: 'due_today_reminder',
      messageContent: 'Your payment is due today. Please pay USD 180.00.',
      status: 'responded',
      metadata: { automated: true, stage: 'due_today_reminder' },
      timestamp: this.dateOffset(0, 8, 45),
    });

    const mediumInbound = await saveBorrowerMessage({
      borrower: { id: mediumBorrower.id } as any,
      loan: { id: mediumLoan.id } as any,
      channel: 'whatsapp',
      direction: 'inbound',
      messageType: 'partial_payment_intent',
      messageContent: 'I can make a partial payment of 80 today.',
      aiResponse: 'Thank you, we have recorded your partial payment intent.',
      status: 'responded',
      timestamp: this.dateOffset(0, 9, 30),
    });

    const lowReminder = await saveBorrowerMessage({
      borrower: { id: lowBorrower.id } as any,
      loan: { id: lowLoan.id } as any,
      channel: 'whatsapp',
      direction: 'outbound',
      messageType: 'upcoming_reminder',
      messageContent: 'Friendly reminder: your next payment is due soon.',
      status: 'responded',
      metadata: { automated: true, stage: 'upcoming_payment_reminder' },
      timestamp: this.dateOffset(-1, 12, 0),
    });

    const recoveryPromises = await repoPaymentPromise.save(
      repoPaymentPromise.create([
        {
          borrower: { id: highBorrower.id } as any,
          loan: { id: highLoan.id } as any,
          sourceMessage: { id: highInboundPromise.id } as any,
          promisedAmount: 120,
          promisedDate: this.dateOnly(this.dateOffset(-9)),
          status: 'broken',
          notes: 'Promise not honored within agreed timeline.',
          resolvedAt: this.dateOffset(-8, 17, 10),
        },
        {
          borrower: { id: mediumBorrower.id } as any,
          loan: { id: mediumLoan.id } as any,
          sourceMessage: { id: mediumInbound.id } as any,
          promisedAmount: 80,
          promisedDate: this.dateOnly(this.dateOffset(2)),
          status: 'open',
          notes: 'Borrower committed to part payment this week.',
        },
        {
          borrower: { id: lowBorrower.id } as any,
          loan: { id: lowLoan.id } as any,
          sourceMessage: { id: lowReminder.id } as any,
          promisedAmount: 60,
          promisedDate: this.dateOnly(this.dateOffset(-3)),
          status: 'kept',
          notes: 'Borrower paid as promised.',
          resolvedAt: this.dateOffset(-2, 14, 15),
        },
      ] as any),
    );

    const recoveryActions = await repoRecoveryAction.save(
      repoRecoveryAction.create([
        {
          borrower: { id: highBorrower.id } as any,
          loan: { id: highLoan.id } as any,
          message: { id: highReminder1.id } as any,
          actionType: 'overdue_notice',
          status: 'completed',
          riskScore: 86,
          riskCategory: 'HIGH',
          details: { reason: '14+ days overdue' },
          executedAt: this.dateOffset(-12, 11, 20),
        },
        {
          borrower: { id: highBorrower.id } as any,
          loan: { id: highLoan.id } as any,
          message: { id: highEscalationMessage.id } as any,
          actionType: 'escalation',
          status: 'escalated',
          riskScore: 86,
          riskCategory: 'HIGH',
          details: { reason: 'Account exceeded 7 overdue days' },
          executedAt: this.dateOffset(-2, 16, 10),
        },
        {
          borrower: { id: mediumBorrower.id } as any,
          loan: { id: mediumLoan.id } as any,
          message: { id: mediumReminderToday.id } as any,
          actionType: 'due_today_reminder',
          status: 'completed',
          riskScore: 34,
          riskCategory: 'MEDIUM',
          details: { reason: 'Due date reached' },
          executedAt: this.dateOffset(0, 8, 50),
        },
        {
          borrower: { id: mediumBorrower.id } as any,
          loan: { id: mediumLoan.id } as any,
          message: { id: mediumInbound.id } as any,
          actionType: 'promise_followup',
          status: 'pending',
          riskScore: 34,
          riskCategory: 'MEDIUM',
          details: { reason: 'Partial payment intent recorded' },
          scheduledFor: this.dateOffset(1, 9, 0),
        },
        {
          borrower: { id: lowBorrower.id } as any,
          loan: { id: lowLoan.id } as any,
          message: { id: lowReminder.id } as any,
          actionType: 'upcoming_payment_reminder',
          status: 'completed',
          riskScore: 14,
          riskCategory: 'LOW',
          details: { reason: 'Upcoming due date reminder' },
          executedAt: this.dateOffset(-1, 12, 5),
        },
      ] as any),
    );

    return {
      branches: 2,
      organizations: 1,
      users: users.length,
      clients: savedClients.length + recoveryBorrowers.length,
      loans: savedLoans.length + recoveryLoans.length,
      payments: savedPayments.length,
      products: savedProducts.length,
      notificationTemplates: savedTemplates.length,
      recoveryDemoBorrowers: recoveryBorrowers.length,
      recoveryDemoInstallments: recoveryInstallments.length,
      recoveryDemoMessages: 7,
      recoveryDemoPromises: recoveryPromises.length,
      recoveryDemoActions: recoveryActions.length,
    };
  }
}
