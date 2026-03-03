import { ForbiddenException } from '@nestjs/common';
import { ScoringModelService } from '../../src/modules/credit-score/scoring.model';
import { ScoringService } from '../../src/modules/credit-score/scoring.service';

describe('ScoringService', () => {
  const fixedSavedAt = new Date('2026-01-15T10:00:00.000Z');

  const clientFixture = {
    id: 'client-1',
    status: 'active',
    monthlyIncome: 2000,
    branch: { id: 'BR001' },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    loans: [
      {
        id: 'loan-1',
        amount: 1000,
        balance: 400,
        status: 'active',
        disbursedAt: new Date('2025-01-01T00:00:00.000Z'),
        payments: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
        installments: [
          {
            dueDate: '2025-02-01',
            status: 'paid',
            paidAt: new Date('2025-02-01T08:00:00.000Z'),
            totalDue: 250,
            principalPaid: 200,
            interestPaid: 50,
            feePaid: 0,
            penaltyPaid: 0,
          },
          {
            dueDate: '2025-03-01',
            status: 'paid',
            paidAt: new Date('2025-03-01T08:00:00.000Z'),
            totalDue: 250,
            principalPaid: 200,
            interestPaid: 50,
            feePaid: 0,
            penaltyPaid: 0,
          },
          {
            dueDate: '2099-01-01',
            status: 'pending',
            totalDue: 250,
            principalPaid: 0,
            interestPaid: 0,
            feePaid: 0,
            penaltyPaid: 0,
          },
        ],
      },
      {
        id: 'loan-2',
        amount: 500,
        balance: 0,
        status: 'completed',
        disbursedAt: new Date('2024-01-01T00:00:00.000Z'),
        payments: [{ id: 'p4' }, { id: 'p5' }],
        installments: [],
      },
    ],
  };

  const createService = () => {
    const scoreRepo = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ ...input, id: 'score-1', computedAt: fixedSavedAt })),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const clientRepo = {
      findOne: jest.fn(),
    };

    const model = new ScoringModelService();
    const service = new ScoringService(scoreRepo as any, clientRepo as any, model);

    return {
      service,
      scoreRepo,
      clientRepo,
    };
  };

  it('computes deterministic client score and stores explanations', async () => {
    const { service, clientRepo } = createService();
    clientRepo.findOne.mockResolvedValue(clientFixture);

    const first = await service.computeForClient('client-1', { id: 'admin-1', role: 'admin' });
    const second = await service.computeForClient('client-1', { id: 'admin-1', role: 'admin' });

    expect(first.score).toBe(second.score);
    expect(first.grade).toBe(second.grade);
    expect(first.modelVersion).toBe(second.modelVersion);
    expect(first.reasons).toEqual(second.reasons);
    expect(Array.isArray(first.reasons)).toBe(true);
    expect(first.reasons[0]).toHaveProperty('feature');
    expect(first.reasons[0]).toHaveProperty('impact');
    expect(first.reasons[0]).toHaveProperty('note');
  });

  it('blocks access when branch-scoped user requests another branch client', async () => {
    const { service, clientRepo } = createService();
    clientRepo.findOne.mockResolvedValue(clientFixture);

    await expect(
      service.computeForClient('client-1', {
        id: 'officer-2',
        role: 'loan_officer',
        branch: 'BR002',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('supports deterministic legacy scoring payloads without persisted client', async () => {
    const { service } = createService();

    const first = await service.scoreFromLegacyPayload({
      amount: 1000,
      balance: 400,
      paid_total: 600,
      num_payments: 6,
      age_days: 0,
      client_tenure_days: 730,
    });

    const second = await service.scoreFromLegacyPayload({
      amount: 1000,
      balance: 400,
      paid_total: 600,
      num_payments: 6,
      age_days: 0,
      client_tenure_days: 730,
    });

    expect(first.score).toBe(second.score);
    expect(first.grade).toBe(second.grade);
    expect(first.model_version).toBe(second.model_version);
    expect(first.explanations).toEqual(second.explanations);
  });
});
