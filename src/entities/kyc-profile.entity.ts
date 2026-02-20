import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

export type CddStatus = 'pending' | 'approved' | 'rejected';
export type RiskRating = 'low' | 'medium' | 'high';

@Entity()
export class KycProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn()
  client: Client;

  @Column({ nullable: true })
  nationalId?: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth?: string;

  @Column({ type: 'text', nullable: true })
  physicalAddress?: string;

  @Column({ nullable: true })
  employmentStatus?: string;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  monthlyIncome?: number;

  @Column({ nullable: true })
  businessSector?: string;

  @Column({ type: 'varchar', default: 'pending' })
  cddStatus: CddStatus;

  @Column({ type: 'varchar', default: 'medium' })
  riskRating: RiskRating;

  @Column({ default: false })
  pep: boolean;

  @Column({ default: false })
  sanctionsHit: boolean;

  @Column({ nullable: true })
  lastReviewedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
