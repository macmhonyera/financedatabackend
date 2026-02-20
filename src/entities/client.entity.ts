import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Branch } from './branch.entity';
import { Loan } from './loan.entity';

@Entity()
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ default: 'active' })
  status: 'active' | 'inactive' | 'defaulted';

  @ManyToOne(() => Branch, (b) => b.clients, { nullable: true })
  branch?: Branch;

  @OneToMany(() => Loan, (l) => l.client)
  loans: Loan[];
}
