import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestingApp, loginAndGetToken, seedDatabase } from '../helpers/test-app';

describe('E2E mobile contracts: sync + idempotency + If-Match + field visits', () => {
  let app: INestApplication;
  let officerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_chars_long_for_validation';
    const { app: a, moduleRef } = await createTestingApp();
    app = a;
    await seedDatabase(moduleRef);
    officerToken = await loginAndGetToken(app, 'officer@harare.com', 'officer123');
    adminToken = await loginAndGetToken(app, 'admin@example.com', 'admin123');
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /sync/loan-officer', () => {
    it('rejects unauthenticated calls', async () => {
      await request(app.getHttpServer()).get('/sync/loan-officer').expect(401);
    });

    it('returns branch-scoped deltas for an officer', async () => {
      const res = await request(app.getHttpServer())
        .get('/sync/loan-officer')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('syncedAt');
      expect(res.body).toHaveProperty('branchId');
      expect(res.body.entities).toHaveProperty('clients');
      expect(res.body.entities).toHaveProperty('loans');
      expect(res.body.entities).toHaveProperty('installments');
      expect(res.body.entities).toHaveProperty('payments');
      expect(res.body.entities).toHaveProperty('paymentPromises');
      expect(res.body.entities).toHaveProperty('recoveryActions');
      expect(res.body.entities).toHaveProperty('fieldVisits');
      expect(Array.isArray(res.body.entities.clients)).toBe(true);
    });

    it('returns empty entities for a future since cursor', async () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const res = await request(app.getHttpServer())
        .get(`/sync/loan-officer?since=${encodeURIComponent(future)}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      for (const list of Object.values(res.body.entities) as any[]) {
        expect(list).toEqual([]);
      }
    });

    it('refuses an admin (no branch)', async () => {
      await request(app.getHttpServer())
        .get('/sync/loan-officer')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('flags hasMore when an entity hits the limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/sync/loan-officer?limit=1')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      // The seed data has multiple clients so limit=1 must hit the cap somewhere.
      expect(res.body.hasMore).toBe(true);
    });
  });

  describe('POST /clients idempotency', () => {
    it('returns the same record when the same idempotencyKey is replayed', async () => {
      const key = `e2e-client-${Date.now()}`;
      const first = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ idempotencyKey: key, name: 'Idempotent Client' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ idempotencyKey: key, name: 'A different name should be ignored' })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.name).toBe('Idempotent Client');
    });
  });

  describe('PUT /clients/:id If-Match', () => {
    let clientId: string;
    let updatedAt: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ name: 'If-Match Subject' })
        .expect(201);
      clientId = created.body.id;

      const fetched = await request(app.getHttpServer())
        .get(`/clients/${clientId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      updatedAt = fetched.body.updatedAt;
      expect(updatedAt).toBeTruthy();
    });

    it('returns 409 with current state when If-Match is stale', async () => {
      const res = await request(app.getHttpServer())
        .put(`/clients/${clientId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .set('If-Match', '2020-01-01T00:00:00.000Z')
        .send({ phone: '+263777888001' })
        .expect(409);

      expect(res.body.message).toMatch(/modified/);
      expect(res.body.currentUpdatedAt).toBeTruthy();
    });

    it('returns 200 when If-Match matches the current updatedAt', async () => {
      await request(app.getHttpServer())
        .put(`/clients/${clientId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .set('If-Match', updatedAt)
        .send({ phone: '+263777888002' })
        .expect(200);
    });

    it('returns 200 when If-Match is omitted (precondition is optional)', async () => {
      await request(app.getHttpServer())
        .put(`/clients/${clientId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ phone: '+263777888003' })
        .expect(200);
    });
  });

  describe('POST /field-visits', () => {
    let clientId: string;

    beforeAll(async () => {
      const list = await request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      clientId = list.body[0]?.id;
      expect(clientId).toBeTruthy();
    });

    it('records a field visit with GPS and surfaces it in the next sync', async () => {
      const before = await request(app.getHttpServer())
        .get('/sync/loan-officer')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      const beforeCount = before.body.entities.fieldVisits.length;

      await request(app.getHttpServer())
        .post('/field-visits')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          clientId,
          capturedAt: new Date().toISOString(),
          latitude: -17.825,
          longitude: 31.033,
          notes: 'E2E visit at borrower shop',
        })
        .expect(201);

      const after = await request(app.getHttpServer())
        .get('/sync/loan-officer')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      expect(after.body.entities.fieldVisits.length).toBe(beforeCount + 1);
    });

    it('deduplicates retried visits via idempotencyKey', async () => {
      const key = `e2e-visit-${Date.now()}`;
      const a = await request(app.getHttpServer())
        .post('/field-visits')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          idempotencyKey: key,
          clientId,
          capturedAt: new Date().toISOString(),
          notes: 'first attempt',
        })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/field-visits')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          idempotencyKey: key,
          clientId,
          capturedAt: new Date().toISOString(),
          notes: 'replay',
        })
        .expect(201);
      expect(b.body.id).toBe(a.body.id);
    });
  });

  describe('POST /storage/upload-url', () => {
    it('returns a presigned upload URL for an authenticated officer', async () => {
      const res = await request(app.getHttpServer())
        .post('/storage/upload-url')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          scope: 'client-documents',
          contentType: 'image/png',
          sizeBytes: 1024,
          suggestedFilename: 'id.png',
        })
        .expect(201);

      expect(res.body.storageKey).toMatch(/^client-documents\//);
      expect(res.body.uploadUrl).toContain('/storage/files/');
      expect(res.body.method).toBe('PUT');
      expect(res.body.headers['Content-Type']).toBe('image/png');
    });
  });
});
