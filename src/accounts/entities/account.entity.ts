import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AccountType {
  CASH = 'cash',
  BANK = 'bank',
}

@Entity('accounts')
@Index(['userId', 'name'], { unique: true })
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  /** ISO 4217 code, e.g. USD, KHR. Immutable after creation. */
  @Column({ type: 'char', length: 3 })
  currency: string;

  /** Stored as a string to avoid floating-point loss. May be negative (credit/overdraft). */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  openingBalance: string;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
