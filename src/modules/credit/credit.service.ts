import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditScore } from './credit.entity';
import axios from 'axios';

@Injectable()
export class CreditService {
  constructor(@InjectRepository(CreditScore) private repo: Repository<CreditScore>) {}

  async scoreApplication(app: { amount:number, balance:number, paid_total?:number, num_payments?:number, age_days?:number, client_tenure_days?:number }, clientId?: string, loanId?: string) {
    const mlUrl = process.env.CREDIT_MODEL_URL || 'http://localhost:8000/score';
    try {
      const resp = await axios.post(mlUrl, app, { timeout: 5000 });
      const data = resp.data;
      const cs = this.repo.create({ clientId, loanId, score: data.score, probDefault: data.prob_default, decision: data.decision, explanations: data.explanations, modelVersion: process.env.CREDIT_MODEL_VERSION || null });
      await this.repo.save(cs);
      return data;
    } catch (err) {
      throw new HttpException('Credit scoring service unavailable', 503);
    }
  }

  async findAll() {
    return this.repo.find();
  }

  async modelHealth() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' }, take: 1000 });
    if (rows.length === 0) {
      return {
        totalScored: 0,
        avgScore: 0,
        avgProbDefault: 0,
        byDecision: {},
        byModelVersion: {},
      };
    }

    const byDecision: Record<string, number> = {};
    const byModelVersion: Record<string, number> = {};
    let scoreSum = 0;
    let probSum = 0;

    for (const row of rows) {
      const decision = row.decision || 'unknown';
      const modelVersion = row.modelVersion || 'unknown';
      byDecision[decision] = (byDecision[decision] || 0) + 1;
      byModelVersion[modelVersion] = (byModelVersion[modelVersion] || 0) + 1;
      scoreSum += Number(row.score || 0);
      probSum += Number(row.probDefault || 0);
    }

    return {
      totalScored: rows.length,
      avgScore: Number((scoreSum / rows.length).toFixed(2)),
      avgProbDefault: Number((probSum / rows.length).toFixed(4)),
      byDecision,
      byModelVersion,
    };
  }
}
