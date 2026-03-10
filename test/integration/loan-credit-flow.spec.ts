import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestingModule } from '@nestjs/testing';
import { createTestingApp, loginAndGetToken, seedDatabase } from '../helpers/test-app';

describe('Integration: loan + repayment + credit score flow', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let adminToken: string;
  let officerToken: string;

  beforeAll(async () => {
    const setup = await createTestingApp();
    app = setup.app;
    moduleRef = setup.moduleRef;

    await seedDatabase(moduleRef);
    adminToken = await loginAndGetToken(app, 'admin@example.com', 'admin123');
    officerToken = await loginAndGetToken(app, 'officer@harare.com', 'officer123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates client, creates loan, records repayment, computes and reads credit score', async () => {
    const createdClient = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Flow Test Client',
        phone: '+1555000100',
        branchId: 'BR001',
        monthlyIncome: 2400,
        employmentType: 'self_employed',
      })
      .expect(201);

    const clientId = createdClient.body.id;
    expect(clientId).toBeDefined();

    const productsResponse = await request(app.getHttpServer())
      .get('/loan-products?includeInactive=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(productsResponse.body)).toBe(true);
    const firstProduct = productsResponse.body[0];
    expect(firstProduct?.id).toBeDefined();

    const asset = await request(app.getHttpServer())
      .post(`/clients/${clientId}/assets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assetType: 'vehicle',
        description: 'Toyota Hilux 2019',
        marketValue: 15000,
      })
      .expect(201);

    expect(asset.body.id).toBeDefined();

    const createdLoan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 800,
        clientId,
        productId: firstProduct.id,
        termMonths: firstProduct.termMonths,
        interestRateAnnual: firstProduct.interestRateAnnual,
        repaymentFrequency: firstProduct.repaymentFrequency,
        currency: 'USD',
        isCollateralized: true,
        collateralAssetIds: [asset.body.id],
        collateralNotes: 'Primary collateral vehicle',
      })
      .expect(201);

    const loanId = createdLoan.body.id;
    expect(loanId).toBeDefined();
    expect(createdLoan.body.client?.id).toBe(clientId);
    expect(createdLoan.body.isCollateralized).toBe(true);
    expect(Number(createdLoan.body.collateralTotalMarketValue)).toBeGreaterThan(0);
    expect(Array.isArray(createdLoan.body.collateralSnapshot?.assets)).toBe(true);
    expect(createdLoan.body.status).toBe('pending');

    await request(app.getHttpServer())
      .post(`/loans/${loanId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 200,
        loanId,
        clientId,
        channel: 'cash',
        branch: 'BR001',
        externalReference: 'FLOW-REF-001',
        idempotencyKey: 'FLOW-IDEMPOTENCY-001',
      })
      .expect(201);

    expect(payment.body.loan?.id || payment.body.loanId).toBe(loanId);

    const computed = await request(app.getHttpServer())
      .post('/credit-score/compute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId, loanId })
      .expect(201);

    expect(computed.body.clientId).toBe(clientId);
    expect(typeof computed.body.score).toBe('number');
    expect(computed.body.score).toBeGreaterThanOrEqual(0);
    expect(computed.body.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D']).toContain(computed.body.grade);
    expect(Array.isArray(computed.body.reasons)).toBe(true);

    const latest = await request(app.getHttpServer())
      .get(`/credit-score/${clientId}/latest`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(latest.body.clientId).toBe(clientId);
    expect(latest.body.score).toBe(computed.body.score);

    const history = await request(app.getHttpServer())
      .get(`/credit-score/${clientId}/history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body.length).toBeGreaterThanOrEqual(1);
    expect(history.body[0].clientId).toBe(clientId);
  });

  it('calculates flat total repayable as principal plus configured interest', async () => {
    const createdClient = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Flat Interest Client',
        phone: '+1555000133',
        branchId: 'BR001',
      })
      .expect(201);

    const flatProduct = await request(app.getHttpServer())
      .post('/loan-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `FLAT-18-${Date.now()}`,
        name: 'Flat 18 Product',
        currency: 'USD',
        minAmount: 100,
        maxAmount: 10000,
        termMonths: 12,
        repaymentFrequency: 'monthly',
        interestRateAnnual: 18,
        processingFeeRate: 0,
        lateFeeRate: 0,
        gracePeriodDays: 0,
        scheduleType: 'flat',
        isActive: true,
      })
      .expect(201);

    const createdLoan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 2000,
        clientId: createdClient.body.id,
        productId: flatProduct.body.id,
        termMonths: 12,
        interestRateAnnual: 18,
        repaymentFrequency: 'monthly',
        currency: 'USD',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/loans/${createdLoan.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const schedule = await request(app.getHttpServer())
      .get(`/loans/${createdLoan.body.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const totalRepayable = (Array.isArray(schedule.body) ? schedule.body : []).reduce(
      (sum: number, row: any) => sum + Number(row?.totalDue || 0),
      0,
    );

    expect(totalRepayable).toBeCloseTo(2360, 2);
  });

  it('enforces one-installment rollover rule and deducts last installment on approval', async () => {
    const round2 = (value: number) => Number((Math.round(value * 100) / 100).toFixed(2));

    const createdClient = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rollover Rule Client',
        phone: '+1555000122',
        branchId: 'BR001',
      })
      .expect(201);

    const rolloverProduct = await request(app.getHttpServer())
      .post('/loan-products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `ROLLOVER-${Date.now()}`,
        name: 'Rollover Control Product',
        currency: 'USD',
        minAmount: 100,
        maxAmount: 10000,
        termMonths: 3,
        repaymentFrequency: 'monthly',
        interestRateAnnual: 0,
        processingFeeRate: 0,
        lateFeeRate: 0,
        gracePeriodDays: 0,
        scheduleType: 'flat',
        isActive: true,
      })
      .expect(201);

    const firstLoan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 1000,
        clientId: createdClient.body.id,
        productId: rolloverProduct.body.id,
        termMonths: rolloverProduct.body.termMonths,
        interestRateAnnual: rolloverProduct.body.interestRateAnnual,
        repaymentFrequency: rolloverProduct.body.repaymentFrequency,
        currency: 'USD',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/loans/${firstLoan.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const scheduleResponse = await request(app.getHttpServer())
      .get(`/loans/${firstLoan.body.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const scheduleRows = (Array.isArray(scheduleResponse.body) ? scheduleResponse.body : []).sort(
      (a: any, b: any) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0),
    );
    expect(scheduleRows.length).toBeGreaterThan(1);

    await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 900,
        clientId: createdClient.body.id,
        productId: rolloverProduct.body.id,
        termMonths: rolloverProduct.body.termMonths,
        interestRateAnnual: rolloverProduct.body.interestRateAnnual,
        repaymentFrequency: rolloverProduct.body.repaymentFrequency,
        currency: 'USD',
      })
      .expect(400);

    const amountToSettleBeforeLastInstallment = round2(
      scheduleRows
        .slice(0, -1)
        .reduce((sum: number, row: any) => sum + Number(row?.totalDue || 0), 0),
    );

    expect(amountToSettleBeforeLastInstallment).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: amountToSettleBeforeLastInstallment,
        loanId: firstLoan.body.id,
        clientId: createdClient.body.id,
        channel: 'cash',
        branch: 'BR001',
        externalReference: `ROLLOVER-PREPAY-${Date.now()}`,
        idempotencyKey: `ROLLOVER-PREPAY-IDEMPOTENCY-${Date.now()}`,
      })
      .expect(201);

    const secondLoan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 900,
        clientId: createdClient.body.id,
        productId: rolloverProduct.body.id,
        termMonths: rolloverProduct.body.termMonths,
        interestRateAnnual: rolloverProduct.body.interestRateAnnual,
        repaymentFrequency: rolloverProduct.body.repaymentFrequency,
        currency: 'USD',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/loans/${secondLoan.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const firstLoanAfterRollover = await request(app.getHttpServer())
      .get(`/loans/${firstLoan.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(firstLoanAfterRollover.body.status).toBe('completed');
    expect(Number(firstLoanAfterRollover.body.balance || 0)).toBeLessThanOrEqual(0.01);

    const paymentsAfterRollover = await request(app.getHttpServer())
      .get(`/payments?loanId=${encodeURIComponent(firstLoan.body.id)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(
      paymentsAfterRollover.body.some(
        (payment: any) => payment?.metadata?.type === 'rollover_settlement',
      ),
    ).toBe(true);
  });

  it('notifies applying loan officer when admin changes loan status', async () => {
    const createdClient = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        name: 'Officer Notification Client',
        phone: '+1555000111',
      })
      .expect(201);

    const productsResponse = await request(app.getHttpServer())
      .get('/loan-products?includeInactive=true')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    const firstProduct = productsResponse.body[0];
    expect(firstProduct?.id).toBeDefined();

    const createdLoan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        amount: 600,
        clientId: createdClient.body.id,
        productId: firstProduct.id,
        termMonths: firstProduct.termMonths,
        interestRateAnnual: firstProduct.interestRateAnnual,
        repaymentFrequency: firstProduct.repaymentFrequency,
        currency: 'USD',
      })
      .expect(201);

    expect(createdLoan.body.appliedByUserId).toBeDefined();
    expect(createdLoan.body.loanOfficer).toBeDefined();

    await request(app.getHttpServer())
      .post(`/loans/${createdLoan.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const myNotifications = await request(app.getHttpServer())
      .get('/notifications/my')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    expect(Array.isArray(myNotifications.body)).toBe(true);
    expect(
      myNotifications.body.some(
        (row: any) =>
          row?.channel === 'in_app' &&
          String(row?.message || '').toLowerCase().includes('has been approved'),
      ),
    ).toBe(true);
  });
});
