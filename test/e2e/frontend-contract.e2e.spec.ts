import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestingModule } from '@nestjs/testing';
import { createTestingApp, loginAndGetToken, seedDatabase } from '../helpers/test-app';

describe('E2E: frontend API contract compatibility', () => {
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

  it('POST /auth/login returns token + user shape expected by frontend', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'admin123' })
      .expect(201);

    expect(typeof res.body.access_token).toBe('string');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('admin@example.com');
    expect(res.body.user).toHaveProperty('role');
  });

  it('GET /clients requires auth and keeps Nest error format', async () => {
    const unauthorized = await request(app.getHttpServer()).get('/clients').expect(401);

    expect(unauthorized.body).toEqual(
      expect.objectContaining({
        statusCode: 401,
        message: expect.any(String),
      }),
    );

    const authorized = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(authorized.body)).toBe(true);
    if (authorized.body.length > 0) {
      expect(authorized.body[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
        }),
      );
    }
  });

  it('GET /loan-products?includeInactive=true returns array contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/loan-products?includeInactive=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    const first = response.body[0];
    expect(first).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        code: expect.any(String),
        name: expect.any(String),
      }),
    );
  });

  it('POST /loans validates payload and returns frontend-consumable error shape', async () => {
    const badRequest = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId: 'missing-amount' })
      .expect(400);

    expect(badRequest.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        message: expect.anything(),
      }),
    );
  });

  it('POST /loans/:id/approve remains admin-only and returns 403 for officer', async () => {
    const client = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Approval Client', branchId: 'BR001' })
      .expect(201);

    const products = await request(app.getHttpServer())
      .get('/loan-products?includeInactive=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const loan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 600,
        clientId: client.body.id,
        productId: products.body[0].id,
        termMonths: products.body[0].termMonths,
      })
      .expect(201);

    const forbidden = await request(app.getHttpServer())
      .post(`/loans/${loan.body.id}/approve`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({})
      .expect(403);

    expect(forbidden.body).toEqual(
      expect.objectContaining({
        statusCode: 403,
        message: expect.any(String),
      }),
    );
  });

  it('client asset endpoints support recording and updating market value', async () => {
    const client = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Asset Client', branchId: 'BR001' })
      .expect(201);

    const createdAsset = await request(app.getHttpServer())
      .post(`/clients/${client.body.id}/assets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assetType: 'land',
        description: 'Residential stand',
        marketValue: 22000,
      })
      .expect(201);

    expect(createdAsset.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        assetType: 'land',
      }),
    );

    const listed = await request(app.getHttpServer())
      .get(`/clients/${client.body.id}/assets?includeInactive=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(listed.body)).toBe(true);
    expect(listed.body.length).toBeGreaterThan(0);
    expect(Number(listed.body[0].marketValue)).toBeGreaterThan(0);

    const updated = await request(app.getHttpServer())
      .patch(`/clients/${client.body.id}/assets/${createdAsset.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ marketValue: 25000 })
      .expect(200);

    expect(Number(updated.body.marketValue)).toBe(25000);
  });

  it('POST /payments and GET /payments?loanId maintain contract used by frontend', async () => {
    const client = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Payment Client', branchId: 'BR001' })
      .expect(201);

    const products = await request(app.getHttpServer())
      .get('/loan-products?includeInactive=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const loan = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 500,
        clientId: client.body.id,
        productId: products.body[0].id,
        termMonths: products.body[0].termMonths,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/loans/${loan.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 120,
        loanId: loan.body.id,
        clientId: client.body.id,
        channel: 'cash',
        branch: 'BR001',
        idempotencyKey: `E2E-PAY-${Date.now()}`,
      })
      .expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
      }),
    );

    const listed = await request(app.getHttpServer())
      .get(`/payments?loanId=${encodeURIComponent(loan.body.id)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(listed.body)).toBe(true);
    expect(listed.body.length).toBeGreaterThan(0);
    expect(listed.body[0]).toEqual(
      expect.objectContaining({
        amount: expect.anything(),
      }),
    );
  });
});
