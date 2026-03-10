import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { Loan } from './loan.entity';
import { BorrowerMessage } from './borrower-message.entity';

export type RecoveryActionType =
  | 'upcoming_payment_reminder'
  | 'due_today_reminder'
  | 'overdue_notice'
  | 'borrower_response'
  | 'promise_followup'
  | 'escalation'
  | 'manual_followup';
export type RecoveryActionStatus = 'pending' | 'completed' | 'failed' | 'escalated';
export type RecoveryRiskCategory = 'LOW' | 'MEDIUM' | 'HIGH';

@Entity({ name: 'recovery_actions' })
export class RecoveryAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'borrower_id' })
  borrower: Client;

  @RelationId((action: RecoveryAction) => action.borrower)
  borrowerId: string;

  @ManyToOne(() => Loan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'loan_id' })
  loan?: Loan;

  @RelationId((action: RecoveryAction) => action.loan)
  loanId?: string;

  @ManyToOne(() => BorrowerMessage, (message) => message.recoveryActions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'message_id' })
  message?: BorrowerMessage;

  @RelationId((action: RecoveryAction) => action.message)
  messageId?: string;

  @Column({ name: 'action_type', type: 'varchar' })
  actionType: RecoveryActionType;

  @Column({ type: 'varchar', default: 'pending' })
  status: RecoveryActionStatus;

  @Column({ name: 'risk_score', type: 'int', default: 0 })
  riskScore: number;

  @Column({ name: 'risk_category', type: 'varchar', default: 'LOW' })
  riskCategory: RecoveryRiskCategory;

  @Column({ type: 'json', nullable: true })
  details?: Record<string, any>;

  @Column({ name: 'scheduled_for', nullable: true })
  scheduledFor?: Date;

  @Column({ name: 'executed_at', nullable: true })
  executedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
