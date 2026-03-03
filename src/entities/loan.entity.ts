import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { Payment } from './payment.entity';
import { LoanProduct, RepaymentFrequency } from './loan-product.entity';
import { LoanInstallment } from './loan-installment.entity';

@Entity()
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ default: 'pending' })
  status: 'pending' | 'active' | 'completed' | 'rejected' | 'overdue' | 'defaulted';

  @ManyToOne(() => Client, (c) => c.loans)
  client: Client;

  @ManyToOne(() => LoanProduct, (p) => p.loans, { nullable: true })
  product?: LoanProduct;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column('decimal', { precision: 7, scale: 4, nullable: true })
  interestRateAnnual?: number;

  @Column({ type: 'int', nullable: true })
  termMonths?: number;

  @Column({ type: 'varchar', default: 'monthly' })
  repaymentFrequency: RepaymentFrequency;

  @Column({ nullable: true })
  disbursedAt?: Date;

  @Column({ nullable: true })
  dueAt?: Date;

  @Column({ nullable: true })
  approvedAt?: Date;

  @Column({ nullable: true })
  approvedByUserId?: string;

  @Column({ nullable: true })
  rejectedAt?: Date;

  @Column({ nullable: true })
  rejectedByUserId?: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'boolean', default: false })
  isCollateralized: boolean;

  @Column('decimal', { precision: 14, scale: 2, nullable: true })
  collateralTotalMarketValue?: number;

  @Column('json', { nullable: true })
  collateralSnapshot?: Record<string, any>;

  @OneToMany(() => Payment, (p) => p.loan)
  payments: Payment[];

  @OneToMany(() => LoanInstallment, (i) => i.loan)
  installments: LoanInstallment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
