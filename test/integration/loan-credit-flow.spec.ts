import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestingModule } from '@nestjs/testing';
import { createTestingApp, loginAndGetToken, seedDatabase } from '../helpers/test-app';

describe('Integration: loan + repayment + credit score flow', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let adminToken: string;

  beforeAll(async () => {
    const setup = await createTestingApp();
    app = setup.app;
    moduleRef = setup.moduleRef;

    await seedDatabase(moduleRef);
    adminToken = await loginAndGetToken(app, 'admin@example.com', 'admin123');
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
});
