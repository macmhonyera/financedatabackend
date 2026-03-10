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

export type PaymentPromiseStatus = 'open' | 'kept' | 'broken' | 'cancelled';

@Entity({ name: 'payment_promises' })
export class PaymentPromise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'borrower_id' })
  borrower: Client;

  @RelationId((promise: PaymentPromise) => promise.borrower)
  borrowerId: string;

  @ManyToOne(() => Loan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'loan_id' })
  loan?: Loan;

  @RelationId((promise: PaymentPromise) => promise.loan)
  loanId?: string;

  @ManyToOne(() => BorrowerMessage, (message) => message.paymentPromises, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'message_id' })
  sourceMessage?: BorrowerMessage;

  @RelationId((promise: PaymentPromise) => promise.sourceMessage)
  messageId?: string;

  @Column('decimal', { name: 'promised_amount', precision: 12, scale: 2, nullable: true })
  promisedAmount?: number;

  @Column({ name: 'promised_date', type: 'date', nullable: true })
  promisedDate?: string;

  @Column({ type: 'varchar', default: 'open' })
  status: PaymentPromiseStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'resolved_at', nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
