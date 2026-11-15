import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';
import { Category } from '../../categories/entities/category.entity';
import { PaymentMethod } from '../../payment-methods/entities/payment-method.entity';
import { User } from '../../users/entities/user.entity';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum TransactionSource {
  MANUAL = 'manual',
  IMPORT = 'import',
}

@Entity('transactions')
@Check('CHK_transactions_amount_positive', '"amount" > 0')
@Index('IDX_transactions_userId_date', ['userId', 'date'])
@Index('IDX_transactions_accountId', ['accountId'])
@Index('IDX_transactions_categoryId', ['categoryId'])
@Index('IDX_transactions_paymentMethodId', ['paymentMethodId'])
@Index('IDX_transactions_importId', ['importId'])
@Index('UQ_transactions_accountId_externalRef', ['accountId', 'externalRef'], {
  unique: true,
  where: '"externalRef" IS NOT NULL',
})
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'accountId' })
  account: Account;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @ManyToOne(() => PaymentMethod, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  /** Always positive; direction comes from `type`. Stored as a string to avoid floating-point loss. */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  /** Copied from the account at write time (ISO 4217). Never accepted from the client. */
  @Column({ type: 'char', length: 3 })
  currency: string;

  /** The day the money moved (YYYY-MM-DD), independent of createdAt. */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: TransactionSource,
    default: TransactionSource.MANUAL,
  })
  source: TransactionSource;

  @Column({ type: 'uuid', nullable: true })
  importId: string | null;

  /** Bank reference (e.g. REF# from the statement). Unique per account when present. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  externalRef: string | null;

  /** Original bank text, kept for auditing and re-parsing. */
  @Column({ type: 'text', nullable: true })
  rawDetails: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
