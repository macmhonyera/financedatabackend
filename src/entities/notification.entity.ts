import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationTemplate, NotificationChannel } from './notification-template.entity';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => NotificationTemplate, (t) => t.notifications, { nullable: true, onDelete: 'SET NULL' })
  template?: NotificationTemplate;

  @Column({ type: 'varchar' })
  channel: NotificationChannel;

  @Column({ nullable: true })
  recipientId?: string;

  @Column()
  recipientAddress: string;

  @Column({ nullable: true })
  subject?: string;

  @Column({ type: 'text' })
  message: string;

  @Column('json', { nullable: true })
  payload?: Record<string, any>;

  @Column({ type: 'varchar', default: 'pending' })
  status: NotificationStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ nullable: true })
  providerMessageId?: string;

  @Column({ nullable: true })
  nextRetryAt?: Date;

  @Column({ nullable: true })
  sentAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
