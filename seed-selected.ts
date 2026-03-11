import 'reflect-metadata';
import { DataSource, In } from 'typeorm';
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';

config();

import { Branch } from './src/entities/branch.entity';
import { Organization } from './src/entities/organization.entity';
import { User } from './src/entities/user.entity';
import { LoanProduct } from './src/entities/loan-product.entity';
import { Client } from './src/entities/client.entity';
import { ClientAsset } from './src/entities/client-asset.entity';
import { Loan } from './src/entities/loan.entity';
import { LoanInstallment } from './src/entities/loan-installment.entity';
import { BorrowerMessage } from './src/entities/borrower-message.entity';
import { PaymentPromise } from './src/entities/payment-promise.entity';
import { RecoveryAction } from './src/entities/recovery-action.entity';
import { Payment } from './src/entities/payment.entity';
import { CreditScoreResult } from './src/modules/credit-score/scoring.entity';

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function dateOffset(days: number, hours = 10, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateOnly(input: Date) {
  return input.toISOString().slice(0, 10);
}

async function run() {
  const databaseHost = process.env.DATABASE_HOST || 'localhost';
  const databaseUrl = process.env.DATABASE_URL || undefined;
  const hasSupabaseHost = databaseHost.includes('supabase.co') || (databaseUrl || '').includes('supabase.co');
  const useSsl = parseBoolean(process.env.DATABASE_SSL) ?? hasSupabaseHost;

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    host: databaseUrl ? undefined : databaseHost,
    port: databaseUrl ? undefined : Number(process.env.DATABASE_PORT) || 5432,
    username: databaseUrl ? undefined : process.env.DATABASE_USER || 'postgres',
    password: databaseUrl ? undefined : process.env.DATABASE_PASSWORD || 'postgres',
    database: databaseUrl ? undefined : process.env.DATABASE_NAME || 'finance_dev',
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    synchronize: true,
    entities: [
      Branch,
      Organization,
      User,
      LoanProduct,
      Client,
      ClientAsset,
      Loan,
      LoanInstallment,
      BorrowerMessage,
      PaymentPromise,
      RecoveryAction,
      Payment,
      CreditScoreResult,
    ],
  });

  await dataSource.initialize();

  const repoBranch = dataSource.getRepository(Branch);
  const repoOrganization = dataSource.getRepository(Organization);
  const repoUser = dataSource.getRepository(User);
  const repoLoanProduct = dataSource.getRepository(LoanProduct);
  const repoClient = dataSource.getRepository(Client);
  const repoLoan = dataSource.getRepository(Loan);
  const repoLoanInstallment = dataSource.getRepository(LoanInstallment);
  const repoBorrowerMessage = dataSource.getRepository(BorrowerMessage);
  const repoPaymentPromise = dataSource.getRepository(PaymentPromise);
  const repoRecoveryAction = dataSource.getRepository(RecoveryAction);
  const repoPayment = dataSource.getRepository(Payment);
  const repoCreditScore = dataSource.getRepository(CreditScoreResult);

  const org = await repoOrganization.save(
    repoOrganization.create({
      name: 'MicroFinance Pro',
      primaryColor: '30 58 138',
      accentColor: '20 184 166',
    }),
  );

  // Branches
  const br1 = await repoBranch.save(repoBranch.create({ id: 'BR001', name: 'Harare', active: true }));
  const br2 = await repoBranch.save(repoBranch.create({ id: 'BR002', name: 'Bulawayo', active: true }));

  // Products
  const productInputs = [
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
  ] as const;

  const savedProducts: LoanProduct[] = [];
  for (const input of productInputs) {
    const existing = await repoLoanProduct.findOne({ where: { code: input.code } });
    const entity = repoLoanProduct.create({ ...(existing || {}), ...input } as any);
    const saved = await repoLoanProduct.save(entity as any);
    savedProducts.push(saved as LoanProduct);
  }

  // Users
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const userInputs: Array<{
    email: string;
    name: string;
    password: string;
    role: User['role'];
    branch?: Branch;
    organization: Organization;
  }> = [
    {
      email: 'admin@example.com',
      name: 'Admin',
      password: 'admin123',
      role: 'admin',
      organization: org,
    },
    {
      email: 'manager@harare.com',
      name: 'ManagerHarare',
      password: 'manager123',
      role: 'manager',
      branch: br1,
      organization: org,
    },
    {
      email: 'manager@bulawayo.com',
      name: 'ManagerBulawayo',
      password: 'manager123',
      role: 'manager',
      branch: br2,
      organization: org,
    },
    {
      email: 'officer@harare.com',
      name: 'OfficerHarare',
      password: 'officer123',
      role: 'loan_officer',
      branch: br1,
      organization: org,
    },
  ];

  for (const input of userInputs) {
    const existing = await repoUser.findOne({ where: { email: input.email } });
    const entity = repoUser.create({
      ...(existing || {}),
      email: input.email,
      name: input.name,
      passwordHash: hash(input.password),
      role: input.role,
      branch: input.branch,
      organization: input.organization,
    } as any);
    await repoUser.save(entity);
  }

  // Clear previous recovery demo data only.
  const existingRecoveryBorrowers = await repoClient
    .createQueryBuilder('client')
    .where('client.name LIKE :pattern', { pattern: 'Recovery Demo - %' })
    .getMany();

  const recoveryBorrowerIds = existingRecoveryBorrowers.map((b) => b.id);
  let existingRecoveryLoanIds: string[] = [];
  let existingRecoveryMessageIds: string[] = [];

  if (recoveryBorrowerIds.length > 0) {
    existingRecoveryLoanIds = (
      await repoLoan
        .createQueryBuilder('loan')
        .leftJoin('loan.client', 'client')
        .where('client.id IN (:...ids)', { ids: recoveryBorrowerIds })
        .select('loan.id', 'id')
        .getRawMany<{ id: string }>()
    ).map((r) => r.id);

    existingRecoveryMessageIds = (
      await repoBorrowerMessage
        .createQueryBuilder('message')
        .where('message.borrowerId IN (:...ids)', { ids: recoveryBorrowerIds })
        .orWhere(existingRecoveryLoanIds.length > 0 ? 'message.loanId IN (:...loanIds)' : '1=0', {
          loanIds: existingRecoveryLoanIds,
        })
        .select('message.id', 'id')
        .getRawMany<{ id: string }>()
    ).map((r) => r.id);

    await repoRecoveryAction
      .createQueryBuilder()
      .delete()
      .from(RecoveryAction)
      .where('borrower_id IN (:...ids)', { ids: recoveryBorrowerIds })
      .orWhere(existingRecoveryLoanIds.length > 0 ? 'loan_id IN (:...loanIds)' : '1=0', {
        loanIds: existingRecoveryLoanIds,
      })
      .orWhere(existingRecoveryMessageIds.length > 0 ? 'message_id IN (:...messageIds)' : '1=0', {
        messageIds: existingRecoveryMessageIds,
      })
      .execute();

    await repoPaymentPromise
      .createQueryBuilder()
      .delete()
      .from(PaymentPromise)
      .where('borrower_id IN (:...ids)', { ids: recoveryBorrowerIds })
      .orWhere(existingRecoveryLoanIds.length > 0 ? 'loan_id IN (:...loanIds)' : '1=0', {
        loanIds: existingRecoveryLoanIds,
      })
      .orWhere(existingRecoveryMessageIds.length > 0 ? 'message_id IN (:...messageIds)' : '1=0', {
        messageIds: existingRecoveryMessageIds,
      })
      .execute();

    if (existingRecoveryMessageIds.length > 0) {
      await repoBorrowerMessage.delete({ id: In(existingRecoveryMessageIds) as any });
    }
    if (existingRecoveryLoanIds.length > 0) {
      await repoPayment
        .createQueryBuilder()
        .delete()
        .from(Payment)
        .where('"loanId" IN (:...loanIds)', { loanIds: existingRecoveryLoanIds })
        .execute();

      await repoCreditScore
        .createQueryBuilder()
        .delete()
        .from(CreditScoreResult)
        .where('loan_id IN (:...loanIds)', { loanIds: existingRecoveryLoanIds })
        .orWhere('client_id IN (:...clientIds)', { clientIds: recoveryBorrowerIds })
        .execute();

      await repoLoanInstallment
        .createQueryBuilder()
        .delete()
        .from(LoanInstallment)
        .where('"loanId" IN (:...loanIds)', { loanIds: existingRecoveryLoanIds })
        .execute();

      await repoLoan.delete({ id: In(existingRecoveryLoanIds) as any });
    }

    await repoClient.delete({ id: In(recoveryBorrowerIds) as any });
  }

  // Recovery demo data
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
  const recoveryProduct = savedProducts[0] as LoanProduct;

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
        disbursedAt: dateOffset(-90, 9),
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
        disbursedAt: dateOffset(-70, 9),
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
        disbursedAt: dateOffset(-45, 9),
      },
    ] as any),
  );

  const [highLoan, mediumLoan, lowLoan] = recoveryLoans as unknown as Loan[];

  const recoveryInstallments = await repoLoanInstallment.save(
    repoLoanInstallment.create([
      {
        loan: { id: highLoan.id } as any,
        installmentNumber: 1,
        dueDate: dateOnly(dateOffset(-35)),
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
        dueDate: dateOnly(dateOffset(-20)),
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
        dueDate: dateOnly(dateOffset(-8)),
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
        dueDate: dateOnly(dateOffset(15)),
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
        dueDate: dateOnly(dateOffset(-10)),
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
        dueDate: dateOnly(dateOffset(20)),
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
        dueDate: dateOnly(dateOffset(50)),
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
        dueDate: dateOnly(dateOffset(-1)),
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
        dueDate: dateOnly(dateOffset(29)),
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
    const saved = await repoBorrowerMessage.save(repoBorrowerMessage.create(payload as any));
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
    timestamp: dateOffset(-12, 11, 15),
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
    timestamp: dateOffset(-2, 16, 5),
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
    timestamp: dateOffset(-7, 9, 45),
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
    timestamp: dateOffset(0, 8, 45),
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
    timestamp: dateOffset(0, 9, 30),
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
    timestamp: dateOffset(-1, 12, 0),
  });

  const recoveryPromises = await repoPaymentPromise.save(
    repoPaymentPromise.create([
      {
        borrower: { id: highBorrower.id } as any,
        loan: { id: highLoan.id } as any,
        sourceMessage: { id: highInboundPromise.id } as any,
        promisedAmount: 120,
        promisedDate: dateOnly(dateOffset(-9)),
        status: 'broken',
        notes: 'Promise not honored within agreed timeline.',
        resolvedAt: dateOffset(-8, 17, 10),
      },
      {
        borrower: { id: mediumBorrower.id } as any,
        loan: { id: mediumLoan.id } as any,
        sourceMessage: { id: mediumInbound.id } as any,
        promisedAmount: 80,
        promisedDate: dateOnly(dateOffset(2)),
        status: 'open',
        notes: 'Borrower committed to part payment this week.',
      },
      {
        borrower: { id: lowBorrower.id } as any,
        loan: { id: lowLoan.id } as any,
        sourceMessage: { id: lowReminder.id } as any,
        promisedAmount: 60,
        promisedDate: dateOnly(dateOffset(-3)),
        status: 'kept',
        notes: 'Borrower paid as promised.',
        resolvedAt: dateOffset(-2, 14, 15),
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
        executedAt: dateOffset(-12, 11, 20),
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
        executedAt: dateOffset(-2, 16, 10),
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
        executedAt: dateOffset(0, 8, 50),
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
        scheduledFor: dateOffset(1, 9, 0),
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
        executedAt: dateOffset(-1, 12, 5),
      },
    ] as any),
  );

  console.log('Selective Supabase seed result:', {
    branches: 2,
    users: userInputs.length,
    products: savedProducts.length,
    recoveryDemoBorrowers: recoveryBorrowers.length,
    recoveryDemoLoans: recoveryLoans.length,
    recoveryDemoInstallments: recoveryInstallments.length,
    recoveryDemoMessages: 6,
    recoveryDemoPromises: recoveryPromises.length,
    recoveryDemoActions: recoveryActions.length,
  });

  await dataSource.destroy();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
