import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Loan } from './loan.entity';

export type RepaymentFrequency = 'weekly' | 'biweekly' | 'monthly';
export type ScheduleType = 'flat' | 'reducing';

@Entity()
export class LoanProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column('decimal', { precision: 12, scale: 2 })
  minAmount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  maxAmount: number;

  @Column({ type: 'int' })
  termMonths: number;

  @Column({ type: 'varchar', default: 'monthly' })
  repaymentFrequency: RepaymentFrequency;

  @Column('decimal', { precision: 7, scale: 4, default: 0 })
  interestRateAnnual: number;

  @Column('decimal', { precision: 7, scale: 4, default: 0 })
  processingFeeRate: number;

  @Column('decimal', { precision: 7, scale: 4, default: 0 })
  lateFeeRate: number;

  @Column({ type: 'int', default: 0 })
  gracePeriodDays: number;

  @Column({ type: 'varchar', default: 'reducing' })
  scheduleType: ScheduleType;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Loan, (loan) => loan.product)
  loans: Loan[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
