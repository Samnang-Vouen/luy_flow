import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { PaymentMethod } from '../../payment-methods/entities/payment-method.entity';
import {
  Transaction,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { Import } from './import.entity';

export enum ImportRowStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  DUPLICATE = 'duplicate',
}

export enum DuplicateKind {
  /** Bank reference already imported: can never be imported again. */
  REFERENCE = 'reference',
  /** Same date, type and amount as an existing transaction: possible duplicate, user decides. */
  FINGERPRINT = 'fingerprint',
}

/** One statement row, parsed and waiting in preview until the import is confirmed. */
@Entity('import_rows')
@Index('UQ_import_rows_importId_rowNumber', ['importId', 'rowNumber'], {
  unique: true,
})
export class ImportRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  importId: string;

  @ManyToOne(() => Import, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'importId' })
  import: Import;

  /** 1-based row number in the file, as the user sees it in Excel. */
  @Column({ type: 'int' })
  rowNumber: number;

  @Column({ type: 'jsonb' })
  cells: string[];

  @Column({
    type: 'enum',
    enum: ImportRowStatus,
    enumName: 'import_rows_status_enum',
  })
  status: ImportRowStatus;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  errors: string[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  warnings: string[];

  /** Whether this row will be imported on confirm. */
  @Column({ type: 'boolean', default: false })
  selected: boolean;

  @Column({ type: 'date', nullable: true })
  date: string | null;

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'import_rows_type_enum',
    nullable: true,
  })
  type: TransactionType | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  amount: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  balance: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  counterparty: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  channel: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  externalRef: string | null;

  @Column({ type: 'text', nullable: true })
  rawDetails: string | null;

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

  @Column({
    type: 'enum',
    enum: DuplicateKind,
    enumName: 'import_rows_duplicate_kind_enum',
    nullable: true,
  })
  duplicateKind: DuplicateKind | null;

  @Column({ type: 'uuid', nullable: true })
  duplicateOfTransactionId: string | null;

  /** Set on confirm: the transaction created from this row. */
  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction | null;
}
