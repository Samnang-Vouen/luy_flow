import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DebtDirection {
  OWED_BY_ME = 'owed_by_me',
  OWED_TO_ME = 'owed_to_me',
}

export enum DebtStatus {
  ACTIVE = 'active',
  PAID = 'paid',
}

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_debts_userId')
  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 120 })
  counterparty: string;

  @Column({ type: 'enum', enum: DebtDirection })
  direction: DebtDirection;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  principalAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  remainingAmount: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  interestRate: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: DebtStatus, default: DebtStatus.ACTIVE })
  status: DebtStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
