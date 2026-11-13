import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum RecurringTransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum RecurringTransactionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
}

@Entity('recurring_transactions')
export class RecurringTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  accountId: string;

  @Column({ type: 'varchar', length: 160 })
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'enum', enum: RecurringTransactionType })
  type: RecurringTransactionType;

  @Column({ type: 'enum', enum: RecurrenceFrequency })
  frequency: RecurrenceFrequency;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({
    type: 'enum',
    enum: RecurringTransactionStatus,
    default: RecurringTransactionStatus.ACTIVE,
  })
  status: RecurringTransactionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
