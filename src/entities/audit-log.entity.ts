import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  actorId?: string;

  @Column({ nullable: true })
  actorRole?: string;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column({ nullable: true })
  entityId?: string;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
