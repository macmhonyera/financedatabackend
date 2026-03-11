import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './branch.entity';
import { Loan } from './loan.entity';
import { ClientAsset } from './client-asset.entity';
import { BorrowerMessage } from './borrower-message.entity';
import { PaymentPromise } from './payment-promise.entity';
import { RecoveryAction } from './recovery-action.entity';

export type ClientDocumentType =
  | 'national_id'
  | 'shop_license'
  | 'car_registration'
  | 'title_deed'
  | 'other';

export type ClientDocumentRecord = {
  id: string;
  documentType: ClientDocumentType;
  documentName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  documentNumber?: string;
  expiryDate?: string;
  notes?: string;
  uploadedAt: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
};

@Entity()
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  idNumber?: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ type: 'simple-json', nullable: true, select: false })
  documents?: ClientDocumentRecord[];

  @Column({ type: 'int', nullable: true })
  creditScore?: number;

  @Column({ default: 'active' })
  status: 'active' | 'inactive' | 'defaulted';

  @Column({ type: 'varchar', default: 'current' })
  collectionStatus: 'current' | 'overdue' | 'defaulted';

  @Column({ nullable: true })
  loanOfficer?: string;

  @Column({ nullable: true })
  businessType?: string;

  @Column({ nullable: true })
  registrationNumber?: string;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  monthlyIncome?: number;

  @Column({ nullable: true })
  employmentType?: string;

  @ManyToOne(() => Branch, (b) => b.clients, { nullable: true })
  branch?: Branch;

  @OneToMany(() => Loan, (l) => l.client)
  loans: Loan[];

  @OneToMany(() => ClientAsset, (asset) => asset.client)
  assets: ClientAsset[];

  @OneToMany(() => BorrowerMessage, (message) => message.borrower)
  borrowerMessages: BorrowerMessage[];

  @OneToMany(() => PaymentPromise, (promise) => promise.borrower)
  paymentPromises: PaymentPromise[];

  @OneToMany(() => RecoveryAction, (action) => action.borrower)
  recoveryActions: RecoveryAction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
