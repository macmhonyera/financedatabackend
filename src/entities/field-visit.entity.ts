import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

@Entity({ name: 'field_visit' })
export class FieldVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true, where: '"idempotencyKey" IS NOT NULL' })
  @Column({ nullable: true })
  idempotencyKey?: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @RelationId((visit: FieldVisit) => visit.client)
  clientId: string;

  @Column()
  officerUserId: string;

  @Column({ nullable: true })
  officerName?: string;

  @Column('decimal', { precision: 9, scale: 6, nullable: true })
  latitude?: number;

  @Column('decimal', { precision: 9, scale: 6, nullable: true })
  longitude?: number;

  @Column()
  capturedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  photoStorageKey?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
