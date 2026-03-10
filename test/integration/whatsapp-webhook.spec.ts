import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource, Not, IsNull } from 'typeorm';
import * as request from 'supertest';
import { createTestingApp, seedDatabase } from '../helpers/test-app';
import { Client } from '../../src/entities/client.entity';
import { BorrowerMessage } from '../../src/entities/borrower-message.entity';

describe('Integration: WhatsApp webhook', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.WHATSAPP_VALIDATE_TWILIO_SIGNATURE = 'false';

    const setup = await createTestingApp();
    app = setup.app;
    moduleRef = setup.moduleRef;
    dataSource = moduleRef.get(DataSource);

    await seedDatabase(moduleRef);
  });

  afterAll(async () => {
    delete process.env.WHATSAPP_VALIDATE_TWILIO_SIGNATURE;
    await app.close();
  });

  it('processes inbound WhatsApp message and logs interaction history', async () => {
    const clientRepo = dataSource.getRepository(Client);
    const messageRepo = dataSource.getRepository(BorrowerMessage);

    const borrower = await clientRepo.findOne({
      where: { phone: Not(IsNull()) as any },
      relations: ['loans'],
      order: { createdAt: 'ASC' },
    });

    expect(borrower).toBeDefined();

    const response = await request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .send({
        From: `whatsapp:${borrower?.phone}`,
        Body: 'How much do I owe?',
        MessageSid: `SM-WEBHOOK-${Date.now()}`,
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        handled: true,
        borrowerFound: true,
        borrowerId: borrower?.id,
      }),
    );
    expect(typeof response.body.reply).toBe('string');
    expect(response.body.reply.length).toBeGreaterThan(10);

    const logs = await messageRepo.find({
      where: { borrower: { id: borrower?.id } as any },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const inbound = logs.find((row) => row.direction === 'inbound');
    const outbound = logs.find((row) => row.direction === 'outbound');

    expect(inbound).toBeDefined();
    expect(inbound?.messageContent).toContain('How much do I owe');
    expect(inbound?.aiResponse).toBeTruthy();

    expect(outbound).toBeDefined();
    expect(outbound?.messageContent).toBeTruthy();
  });
});
