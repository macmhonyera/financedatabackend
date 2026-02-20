import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
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

  @CreateDateColumn()
  createdAt: Date;
}
