import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createTestingApp, seedDatabase } from '../helpers/test-app';
import { Branch } from '../../src/entities/branch.entity';
import { Client } from '../../src/entities/client.entity';
import { Loan } from '../../src/entities/loan.entity';
import { LoanInstallment } from '../../src/entities/loan-installment.entity';
import { RecoveryAction } from '../../src/entities/recovery-action.entity';
import { BorrowerMessage } from '../../src/entities/borrower-message.entity';
import { AiRecoveryAgentService } from '../../src/modules/ai-recovery-agent/ai-recovery-agent.service';

describe('Integration: AI recovery cron sweep', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: AiRecoveryAgentService;

  beforeAll(async () => {
    process.env.WHATSAPP_PROVIDER = 'twilio';
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.WHATSAPP_TWILIO_FROM;
    delete process.env.TWILIO_WHATSAPP_FROM;

    const setup = await createTestingApp();
    app = setup.app;
    moduleRef = setup.moduleRef;
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(AiRecoveryAgentService);

    await seedDatabase(moduleRef);
  });

  afterAll(async () => {
    delete process.env.WHATSAPP_PROVIDER;
    await app.close();
  });

  it('creates recovery actions for installments due in 2 days', async () => {
    const branchRepo = dataSource.getRepository(Branch);
    const clientRepo = dataSource.getRepository(Client);
    const loanRepo = dataSource.getRepository(Loan);
    const installmentRepo = dataSource.getRepository(LoanInstallment);
    const actionRepo = dataSource.getRepository(RecoveryAction);
    const messageRepo = dataSource.getRepository(BorrowerMessage);

    const branch = await branchRepo.findOne({ where: { id: 'BR001' } });
    expect(branch).toBeDefined();

    const borrower = (await clientRepo.save(
      clientRepo.create({
        name: 'Cron Borrower',
        phone: '+263771999001',
        status: 'active',
        branch: { id: 'BR001' } as any,
      } as any),
    )) as unknown as Client;

    const loan = (await loanRepo.save(
      loanRepo.create({
        amount: 500,
        balance: 500,
        status: 'active',
        client: { id: borrower.id } as any,
        currency: 'USD',
        interestRateAnnual: 12,
        termMonths: 6,
        repaymentFrequency: 'monthly',
      } as any),
    )) as unknown as Loan;

    const dueInTwoDays = new Date();
    dueInTwoDays.setDate(dueInTwoDays.getDate() + 2);

    await installmentRepo.save(
      installmentRepo.create({
        loan: { id: loan.id } as any,
        installmentNumber: 1,
        dueDate: dueInTwoDays.toISOString().slice(0, 10),
        principalDue: 80,
        interestDue: 5,
        feeDue: 0,
        penaltyDue: 0,
        totalDue: 85,
        principalPaid: 0,
        interestPaid: 0,
        feePaid: 0,
        penaltyPaid: 0,
        status: 'pending',
      } as any),
    );

    const summary = await service.runDailyReminderSweep(new Date());

    expect(summary.evaluatedLoans).toBeGreaterThan(0);

    const action = await actionRepo.findOne({
      where: {
        borrower: { id: borrower.id } as any,
        loan: { id: loan.id } as any,
        actionType: 'upcoming_payment_reminder' as any,
      },
      order: { createdAt: 'DESC' },
    });

    expect(action).toBeDefined();

    const outbound = await messageRepo.findOne({
      where: {
        borrower: { id: borrower.id } as any,
        loan: { id: loan.id } as any,
        messageType: 'upcoming_reminder' as any,
      },
      order: { createdAt: 'DESC' },
    });

    expect(outbound).toBeDefined();
    expect(outbound?.messageContent).toContain('reminder');
  });
});
