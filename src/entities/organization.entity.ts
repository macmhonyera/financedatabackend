import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'organization' })
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'MicroFinance Pro' })
  name: string;

  @Column({ default: '30 58 138' })
  primaryColor: string;

  @Column({ default: '20 184 166' })
  accentColor: string;

  @Column({ type: 'text', nullable: true })
  logoUrl?: string | null;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
