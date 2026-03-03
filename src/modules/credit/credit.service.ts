import { Injectable } from '@nestjs/common';
import { ScoringService } from '../credit-score/scoring.service';

@Injectable()
export class CreditService {
  constructor(private readonly scoring: ScoringService) {}

  async scoreApplication(
    app: {
      amount: number;
      balance: number;
      paid_total?: number;
      num_payments?: number;
      age_days?: number;
      client_tenure_days?: number;
    },
    clientId?: string,
    loanId?: string,
    user?: any,
  ) {
    return this.scoring.scoreFromLegacyPayload(
      {
        ...app,
        clientId,
        loanId,
      },
      user,
    );
  }

  async findAll(user?: any) {
    return this.scoring.listAll(user);
  }

  async modelHealth(user?: any) {
    return this.scoring.modelHealth(user);
  }
}
