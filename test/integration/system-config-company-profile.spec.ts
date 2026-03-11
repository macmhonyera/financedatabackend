import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { createTestingApp, loginAndGetToken, seedDatabase } from '../helpers/test-app';

describe('Integration: system-config company profile', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const setup = await createTestingApp();
    app = setup.app;
    moduleRef = setup.moduleRef;

    await seedDatabase(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it('loads and updates organization branding with role restrictions', async () => {
    const adminToken = await loginAndGetToken(app, 'admin@example.com', 'admin123');

    const initial = await request(app.getHttpServer())
      .get('/system-config/company-profile')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(initial.body.companyName).toBeDefined();
    expect(initial.body.organizationId).toBeDefined();

    const updated = await request(app.getHttpServer())
      .patch('/system-config/company-profile')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyName: 'Acme Lending Ltd',
        primary: '12 34 56',
        accent: '90 120 140',
        logo: 'data:image/png;base64,abc123',
      })
      .expect(200);

    expect(updated.body.companyName).toBe('Acme Lending Ltd');
    expect(updated.body.primary).toBe('12 34 56');
    expect(updated.body.accent).toBe('90 120 140');
    expect(updated.body.logo).toContain('data:image/png;base64');

    const managerToken = await loginAndGetToken(app, 'manager@harare.com', 'manager123');
    await request(app.getHttpServer())
      .get('/system-config/company-profile')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.companyName).toBe('Acme Lending Ltd');
      });

    const officerToken = await loginAndGetToken(app, 'officer@harare.com', 'officer123');
    await request(app.getHttpServer())
      .patch('/system-config/company-profile')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ companyName: 'Not Allowed' })
      .expect(403);
  });
});
