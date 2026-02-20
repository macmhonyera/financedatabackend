import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Client } from './client.entity';

@Entity()
export class Branch {
  @PrimaryColumn()
  id: string; // e.g. BR001

  @Column()
  name: string;

  @OneToMany(() => User, (u) => u.branch)
  users: User[];

  @OneToMany(() => Client, (c) => c.branch)
  clients: Client[];
}
