import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { createTestingApp, loginAndGetToken, seedDatabase } from '../helpers/test-app';

jest.setTimeout(30000);

describe('Integration: client profile photo and documents', () => {
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

  it('uploads profile photo, uploads document, lists and deletes document', async () => {
    const managerToken = await loginAndGetToken(app, 'manager@harare.com', 'manager123');

    const clientsRes = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(Array.isArray(clientsRes.body)).toBe(true);
    expect(clientsRes.body.length).toBeGreaterThan(0);
    const clientId = clientsRes.body[0].id;

    const profilePhotoDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WmQXkQAAAAASUVORK5CYII=';

    const profilePhotoRes = await request(app.getHttpServer())
      .post(`/clients/${clientId}/profile-photo`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ dataUrl: profilePhotoDataUrl })
      .expect(201);

    expect(profilePhotoRes.body.avatar).toContain('data:image/png;base64');

    const docDataUrl = 'data:application/pdf;base64,JVBERi0xLjQK';
    const uploadRes = await request(app.getHttpServer())
      .post(`/clients/${clientId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        documentType: 'national_id',
        documentName: 'National-ID',
        dataUrl: docDataUrl,
        documentNumber: '63-123456A10',
      })
      .expect(201);

    expect(uploadRes.body.documentType).toBe('national_id');
    expect(uploadRes.body.documentName).toContain('National-ID');

    const listRes = await request(app.getHttpServer())
      .get(`/clients/${clientId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);
    const documentId = listRes.body[0].id;

    await request(app.getHttpServer())
      .delete(`/clients/${clientId}/documents/${documentId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const afterDeleteRes = await request(app.getHttpServer())
      .get(`/clients/${clientId}/documents`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(afterDeleteRes.body.length).toBe(0);
  });
});
