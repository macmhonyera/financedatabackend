import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class CreditScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  clientId: string;

  @Column({ nullable: true })
  loanId: string;

  @Column('float')
  score: number;

  @Column('float')
  probDefault: number;

  @Column({ length: 20 })
  decision: string;

  @Column('json', { nullable: true })
  explanations: any;

  @Column({ nullable: true })
  modelVersion: string;

  @CreateDateColumn()
  createdAt: Date;
}
