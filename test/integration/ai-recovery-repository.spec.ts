import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createTestingApp, seedDatabase } from '../helpers/test-app';
import { Client } from '../../src/entities/client.entity';
import { Loan } from '../../src/entities/loan.entity';
import { BorrowerMessage } from '../../src/entities/borrower-message.entity';
import { PaymentPromise } from '../../src/entities/payment-promise.entity';
import { RecoveryAction } from '../../src/entities/recovery-action.entity';

describe('Integration: AI recovery repositories', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    const setup = await createTestingApp();
    app = setup.app;
    moduleRef = setup.moduleRef;
    dataSource = moduleRef.get(DataSource);

    await seedDatabase(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists message, payment promise, and recovery action relations', async () => {
    const clientRepo = dataSource.getRepository(Client);
    const loanRepo = dataSource.getRepository(Loan);
    const messageRepo = dataSource.getRepository(BorrowerMessage);
    const promiseRepo = dataSource.getRepository(PaymentPromise);
    const actionRepo = dataSource.getRepository(RecoveryAction);

    const borrower = (await clientRepo.save(
      clientRepo.create({
        name: 'Repository Borrower',
        phone: '+263771555100',
        status: 'active',
        branch: { id: 'BR001' } as any,
      } as any),
    )) as unknown as Client;

    const loan = (await loanRepo.save(
      loanRepo.create({
        amount: 300,
        balance: 250,
        status: 'active',
        client: { id: borrower.id } as any,
        currency: 'USD',
        interestRateAnnual: 10,
        termMonths: 3,
        repaymentFrequency: 'monthly',
      } as any),
    )) as unknown as Loan;

    const message = (await messageRepo.save(
      messageRepo.create({
        borrower: { id: borrower.id } as any,
        loan: { id: loan.id } as any,
        channel: 'whatsapp',
        direction: 'inbound',
        messageType: 'promise_to_pay',
        messageContent: 'I will pay tomorrow',
        aiResponse: 'Thanks, noted.',
        status: 'responded',
      } as any),
    )) as unknown as BorrowerMessage;

    await promiseRepo.save(
      promiseRepo.create({
        borrower: { id: borrower.id } as any,
        loan: { id: loan.id } as any,
        sourceMessage: { id: message.id } as any,
        promisedAmount: 100,
        promisedDate: new Date().toISOString().slice(0, 10),
        status: 'open',
      } as any),
    );

    await actionRepo.save(
      actionRepo.create({
        borrower: { id: borrower.id } as any,
        loan: { id: loan.id } as any,
        message: { id: message.id } as any,
        actionType: 'promise_followup',
        status: 'pending',
        riskScore: 25,
        riskCategory: 'LOW',
        details: { source: 'test' },
      } as any),
    );

    const savedPromise = await promiseRepo.findOne({
      where: { sourceMessage: { id: message.id } as any },
      relations: ['borrower', 'loan', 'sourceMessage'],
    });

    const savedAction = await actionRepo.findOne({
      where: { message: { id: message.id } as any },
      relations: ['borrower', 'loan', 'message'],
    });

    expect(savedPromise).toBeDefined();
    expect(savedPromise?.borrower?.id).toBe(borrower.id);
    expect(savedPromise?.loan?.id).toBe(loan.id);
    expect(savedPromise?.sourceMessage?.id).toBe(message.id);

    expect(savedAction).toBeDefined();
    expect(savedAction?.borrower?.id).toBe(borrower.id);
    expect(savedAction?.loan?.id).toBe(loan.id);
    expect(savedAction?.message?.id).toBe(message.id);
  });
});
