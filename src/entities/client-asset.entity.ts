import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity';

export type ClientAssetStatus = 'active' | 'inactive' | 'disposed';

@Entity('client_asset')
export class ClientAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'varchar', length: 100 })
  assetType: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column('decimal', { precision: 14, scale: 2 })
  marketValue: number;

  @Column({ type: 'date' })
  valuationDate: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: ClientAssetStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Base64 data URL of the asset photo (image/jpeg or image/png). */
  @Column({ type: 'text', nullable: true })
  photoDataUrl?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  photoCapturedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  photoCapturedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
