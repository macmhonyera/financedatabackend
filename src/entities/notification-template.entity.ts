import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Notification } from './notification.entity';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

@Entity()
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'varchar' })
  channel: NotificationChannel;

  @Column({ nullable: true })
  subjectTemplate?: string;

  @Column({ type: 'text' })
  bodyTemplate: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Notification, (n) => n.template)
  notifications: Notification[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
