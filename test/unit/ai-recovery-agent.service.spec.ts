import { BadRequestException } from '@nestjs/common';
import { AiRecoveryAgentService } from '../../src/modules/ai-recovery-agent/ai-recovery-agent.service';

const createService = () => {
  const repoMock = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const notificationsMock = {
    enqueue: jest.fn(),
  };

  return {
    service: new AiRecoveryAgentService(
      repoMock as any,
      repoMock as any,
      repoMock as any,
      repoMock as any,
      repoMock as any,
      repoMock as any,
      repoMock as any,
      notificationsMock as any,
    ),
    repoMock,
    notificationsMock,
  };
};

describe('AiRecoveryAgentService (unit)', () => {
  it('detects promise to pay intent with amount and date', () => {
    const { service } = createService();
    const result = service.interpretBorrowerMessage('I will pay 120 tomorrow');

    expect(result.intent).toBe('promise_to_pay');
    expect(result.amount).toBe(120);
    expect(result.promiseDate).toBeDefined();
  });

  it('detects dispute intent', () => {
    const { service } = createService();
    const result = service.interpretBorrowerMessage('This amount is wrong, I dispute it');

    expect(result.intent).toBe('dispute');
  });

  it('detects partial payment intent', () => {
    const { service } = createService();
    const result = service.interpretBorrowerMessage('I can make a partial payment of 60');

    expect(result.intent).toBe('partial_payment_intent');
    expect(result.amount).toBe(60);
  });

  it('parses Twilio webhook payload', () => {
    const { service } = createService();

    const parsed = service.parseIncomingWebhookMessage({
      From: 'whatsapp:+263771234567',
      Body: 'How much do I owe?',
      MessageSid: 'SM123',
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        provider: 'twilio',
        fromPhone: '+263771234567',
        text: 'How much do I owe?',
        providerMessageId: 'SM123',
      }),
    );
  });

  it('rejects unsupported webhook payloads', () => {
    const { service } = createService();

    expect(() => service.validateWebhookRequest({ headers: {} }, { foo: 'bar' })).toThrow(
      BadRequestException,
    );
  });

  it('orders escalations by entity property path for query builder compatibility', async () => {
    const { service, repoMock } = createService();
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    repoMock.createQueryBuilder.mockReturnValue(qb);

    await service.getEscalations({ role: 'admin' }, 20);

    expect(qb.orderBy).toHaveBeenCalledWith('action.createdAt', 'DESC');
    expect(qb.getMany).toHaveBeenCalledTimes(1);
  });
});
