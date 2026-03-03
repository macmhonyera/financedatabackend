import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Client } from '../../entities/client.entity';
import { CreditGrade, ScoreReason } from './scoring.model';

@Entity('credit_score_results')
@Index(['clientId', 'computedAt'])
export class CreditScoreResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'loan_id', nullable: true })
  loanId?: string;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'varchar', length: 1 })
  grade: CreditGrade;

  @Column({ type: 'json' })
  reasons: ScoreReason[];

  @Column({ name: 'model_version', type: 'varchar', length: 64 })
  modelVersion: string;

  @Column({ name: 'inputs_snapshot', type: 'json' })
  inputsSnapshot: Record<string, any>;

  @Column({ name: 'computed_by_user_id', nullable: true })
  computedByUserId?: string;

  @CreateDateColumn({ name: 'computed_at' })
  computedAt: Date;
}
