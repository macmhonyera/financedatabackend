import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from './branch.entity';
import { Organization } from './organization.entity';

export type UserRole = 'admin' | 'manager' | 'loan_officer' | 'collector';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'varchar', default: 'collector' })
  role: UserRole;

  @ManyToOne(() => Branch, (b) => b.users, { nullable: true })
  branch?: Branch;

  @ManyToOne(() => Organization, (org) => org.users, { nullable: true, onDelete: 'SET NULL' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
