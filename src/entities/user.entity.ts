import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from './branch.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
