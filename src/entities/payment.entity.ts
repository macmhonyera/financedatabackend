import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Loan } from './loan.entity';
import { Client } from './client.entity';

export type ReconciliationStatus = 'pending' | 'reconciled' | 'disputed';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @ManyToOne(() => Loan, (l) => l.payments)
  loan: Loan;

  @ManyToOne(() => Client, { nullable: true })
  client?: Client;

  @Column({ nullable: true })
  branch?: string;

  @Column({ nullable: true, unique: true })
  idempotencyKey?: string;

  @Column({ nullable: true })
  externalReference?: string;

  @Column({ nullable: true })
  channel?: string;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'varchar', default: 'pending' })
  reconciliationStatus: ReconciliationStatus;

  @Column({ nullable: true })
  reconciledAt?: Date;

  @Column({ nullable: true })
  receiptImageKey?: string;

  /** Base64 data URL of the receipt photo (handwritten or printed). */
  @Column({ type: 'text', nullable: true })
  receiptDataUrl?: string;

  /** Auto-generated receipt number, unique across the org. */
  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  receiptNumber?: string;

  /** User id of the officer who recorded the payment. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  issuedByUserId?: string;

  /** Display name of the officer who recorded the payment (denormalized for receipts). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  issuedByName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
