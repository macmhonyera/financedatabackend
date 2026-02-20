import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

export type ComplaintChannel = 'in_app' | 'sms' | 'email' | 'phone' | 'walk_in';
export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

@Entity()
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  client?: Client;

  @Column({ nullable: true })
  branchId?: string;

  @Column({ type: 'varchar', default: 'in_app' })
  channel: ComplaintChannel;

  @Column()
  category: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', default: 'open' })
  status: ComplaintStatus;

  @Column({ nullable: true })
  assignedToUserId?: string;

  @Column({ type: 'text', nullable: true })
  resolutionSummary?: string;

  @CreateDateColumn()
  openedAt: Date;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
