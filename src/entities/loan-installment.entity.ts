import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  RelationId,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Loan } from './loan.entity';

export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue';

@Entity()
export class LoanInstallment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Loan, (loan) => loan.installments, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @RelationId((installment: LoanInstallment) => installment.loan)
  loanId: string;

  @Column({ type: 'int' })
  installmentNumber: number;

  @Column({ type: 'date' })
  dueDate: string;

  @Column('decimal', { precision: 12, scale: 2 })
  principalDue: number;

  @Column('decimal', { precision: 12, scale: 2 })
  interestDue: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  feeDue: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  penaltyDue: number;

  @Column('decimal', { precision: 12, scale: 2 })
  totalDue: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  principalPaid: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  interestPaid: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  feePaid: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  penaltyPaid: number;

  @Column({ type: 'varchar', default: 'pending' })
  status: InstallmentStatus;

  @Column({ nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
