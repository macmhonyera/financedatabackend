import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

export type AmlSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AmlStatus = 'open' | 'under_review' | 'reported' | 'closed';

@Entity()
export class AmlEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  client?: Client;

  @Column()
  eventType: string;

  @Column({ type: 'varchar', default: 'medium' })
  severity: AmlSeverity;

  @Column({ type: 'varchar', default: 'open' })
  status: AmlStatus;

  @Column('json', { nullable: true })
  details?: Record<string, any>;

  @Column({ nullable: true })
  reportedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
