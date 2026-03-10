import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { Loan } from './loan.entity';
import { PaymentPromise } from './payment-promise.entity';
import { RecoveryAction } from './recovery-action.entity';

export type BorrowerMessageDirection = 'inbound' | 'outbound';
export type BorrowerMessageType =
  | 'incoming_query'
  | 'upcoming_reminder'
  | 'due_today_reminder'
  | 'overdue_notice'
  | 'promise_to_pay'
  | 'dispute'
  | 'partial_payment_intent'
  | 'escalation'
  | 'general_response';
export type BorrowerMessageStatus = 'received' | 'processed' | 'responded' | 'failed';

@Entity({ name: 'borrower_messages' })
export class BorrowerMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'borrower_id' })
  borrower: Client;

  @RelationId((message: BorrowerMessage) => message.borrower)
  borrowerId: string;

  @ManyToOne(() => Loan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'loan_id' })
  loan?: Loan;

  @RelationId((message: BorrowerMessage) => message.loan)
  loanId?: string;

  @Column({ type: 'varchar', default: 'whatsapp' })
  channel: 'whatsapp' | 'sms';

  @Column({ type: 'varchar' })
  direction: BorrowerMessageDirection;

  @Column({ name: 'message_type', type: 'varchar', default: 'incoming_query' })
  messageType: BorrowerMessageType;

  @Column({ name: 'message_content', type: 'text' })
  messageContent: string;

  @Column({ name: 'ai_response', type: 'text', nullable: true })
  aiResponse?: string;

  @Column({ name: 'provider_message_id', nullable: true })
  providerMessageId?: string;

  @Column({ name: 'status', type: 'varchar', default: 'received' })
  status: BorrowerMessageStatus;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @OneToMany(() => PaymentPromise, (promise) => promise.sourceMessage)
  paymentPromises: PaymentPromise[];

  @OneToMany(() => RecoveryAction, (action) => action.message)
  recoveryActions: RecoveryAction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
