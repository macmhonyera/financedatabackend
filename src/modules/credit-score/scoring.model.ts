import { Injectable } from '@nestjs/common';

export type CreditGrade = 'A' | 'B' | 'C' | 'D';

export interface ScoreReason {
  feature: string;
  impact: number;
  note: string;
}

export interface CreditScoreFeatures {
  onTimeRatio: number | null;
  maxDaysPastDue: number;
  defaultedLoans: number;
  completedLoans: number;
  activeLoans: number;
  totalLoans: number;
  totalBorrowed: number;
  totalOutstanding: number;
  totalPayments: number;
  monthlyIncome: number | null;
  monthlyDebtService: number | null;
  clientTenureMonths: number;
  clientStatus: string | null;
}

export interface CreditScoreComputation {
  score: number;
  grade: CreditGrade;
  reasons: ScoreReason[];
  modelVersion: string;
}

@Injectable()
export class ScoringModelService {
  readonly modelVersion = process.env.CREDIT_SCORE_MODEL_VERSION || 'rules-v1.0.0';

  private readonly gradeThresholds = {
    cMin: Number(process.env.CREDIT_SCORE_C_MIN ?? 40),
    bMin: Number(process.env.CREDIT_SCORE_B_MIN ?? 60),
    aMin: Number(process.env.CREDIT_SCORE_A_MIN ?? 75),
  };

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private gradeFor(score: number): CreditGrade {
    const normalizedA = this.clamp(this.gradeThresholds.aMin, 0, 100);
    const normalizedB = this.clamp(this.gradeThresholds.bMin, 0, normalizedA);
    const normalizedC = this.clamp(this.gradeThresholds.cMin, 0, normalizedB);

    if (score >= normalizedA) return 'A';
    if (score >= normalizedB) return 'B';
    if (score >= normalizedC) return 'C';
    return 'D';
  }

  compute(features: CreditScoreFeatures): CreditScoreComputation {
    const reasons: ScoreReason[] = [];
    let score = 50;

    const pushReason = (feature: string, impact: number, note: string) => {
      const safeImpact = Number.isFinite(impact) ? Math.round(impact) : 0;
      score += safeImpact;
      reasons.push({ feature, impact: safeImpact, note });
    };

    if (features.onTimeRatio === null) {
      pushReason('repayment_on_time_ratio', 0, 'No due installments yet to evaluate repayment timing');
    } else if (features.onTimeRatio >= 0.95) {
      pushReason('repayment_on_time_ratio', 22, 'Excellent on-time repayment history');
    } else if (features.onTimeRatio >= 0.85) {
      pushReason('repayment_on_time_ratio', 14, 'Strong on-time repayment history');
    } else if (features.onTimeRatio >= 0.7) {
      pushReason('repayment_on_time_ratio', 6, 'Moderate on-time repayment history');
    } else if (features.onTimeRatio >= 0.5) {
      pushReason('repayment_on_time_ratio', -6, 'Frequent delayed repayments detected');
    } else {
      pushReason('repayment_on_time_ratio', -14, 'Weak repayment timing history');
    }

    if (features.maxDaysPastDue <= 0) {
      pushReason('recent_delinquency_days', 8, 'No current delinquency detected');
    } else if (features.maxDaysPastDue <= 7) {
      pushReason('recent_delinquency_days', -5, 'Minor recent delinquency observed');
    } else if (features.maxDaysPastDue <= 30) {
      pushReason('recent_delinquency_days', -12, 'Material delinquency observed');
    } else {
      pushReason('recent_delinquency_days', -20, 'Severe delinquency observed');
    }

    if (features.defaultedLoans > 0) {
      const defaultPenalty = -Math.min(30, features.defaultedLoans * 18);
      pushReason('default_history', defaultPenalty, 'Client has defaulted loans in history');
    } else {
      pushReason('default_history', 6, 'No default history detected');
    }

    if (features.completedLoans > 0) {
      const completionBoost = Math.min(12, features.completedLoans * 3);
      pushReason('completed_loans', completionBoost, 'Completed loans indicate repayment discipline');
    } else {
      pushReason('completed_loans', 0, 'No completed loan history yet');
    }

    if (features.totalBorrowed > 0) {
      const utilization = features.totalOutstanding / features.totalBorrowed;
      if (utilization <= 0.25) {
        pushReason('credit_utilization', 8, 'Outstanding debt is low relative to borrowing history');
      } else if (utilization <= 0.5) {
        pushReason('credit_utilization', 4, 'Outstanding debt is manageable');
      } else if (utilization <= 0.8) {
        pushReason('credit_utilization', -4, 'Outstanding debt is elevated');
      } else {
        pushReason('credit_utilization', -10, 'Outstanding debt is very high');
      }
    } else {
      pushReason('credit_utilization', 0, 'Insufficient borrowing history for utilization assessment');
    }

    if (features.totalLoans > 0) {
      const paymentsPerLoan = features.totalPayments / features.totalLoans;
      if (paymentsPerLoan >= 3) {
        pushReason('payment_activity', 5, 'Healthy payment activity across loans');
      } else if (paymentsPerLoan >= 1) {
        pushReason('payment_activity', 2, 'Moderate payment activity');
      } else {
        pushReason('payment_activity', -5, 'Low payment activity for existing loans');
      }
    } else {
      pushReason('payment_activity', 0, 'No loan history available for payment activity');
    }

    if (features.monthlyIncome && features.monthlyIncome > 0 && features.monthlyDebtService !== null) {
      const dti = features.monthlyDebtService / features.monthlyIncome;
      if (dti <= 0.25) {
        pushReason('debt_to_income', 12, 'Debt-to-income ratio is strong');
      } else if (dti <= 0.4) {
        pushReason('debt_to_income', 6, 'Debt-to-income ratio is acceptable');
      } else if (dti <= 0.55) {
        pushReason('debt_to_income', -6, 'Debt-to-income ratio is elevated');
      } else {
        pushReason('debt_to_income', -14, 'Debt-to-income ratio is high');
      }
    } else {
      pushReason('debt_to_income', 0, 'Income data unavailable; debt-to-income not scored');
    }

    if (features.clientTenureMonths >= 24) {
      pushReason('client_tenure_months', 6, 'Long client tenure supports stability');
    } else if (features.clientTenureMonths >= 12) {
      pushReason('client_tenure_months', 3, 'Client tenure is stable');
    } else if (features.clientTenureMonths < 6) {
      pushReason('client_tenure_months', -2, 'Short tenure provides limited behavioral history');
    } else {
      pushReason('client_tenure_months', 0, 'Moderate tenure history');
    }

    if (features.clientStatus === 'defaulted') {
      pushReason('client_status', -12, 'Client status is marked defaulted');
    } else if (features.clientStatus === 'inactive') {
      pushReason('client_status', -4, 'Client status is inactive');
    } else {
      pushReason('client_status', 2, 'Client status is active');
    }

    const normalizedScore = this.clamp(Math.round(score), 0, 100);
    const grade = this.gradeFor(normalizedScore);

    return {
      score: normalizedScore,
      grade,
      reasons,
      modelVersion: this.modelVersion,
    };
  }
}
