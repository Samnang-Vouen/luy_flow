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
import { User } from '../../../users/entities/user.entity';
import type { PaymentMethodMappingKey } from '../../parsers/details.parser';

/** Zero-based column positions in the statement (header names repeat, e.g. three "Ccy"). */
export interface ImportColumnMapping {
  date: number;
  details: number;
  moneyIn: number;
  moneyOut: number;
  balance?: number | null;
  /** Currency columns to check against the account currency. */
  currencies?: number[];
}

@Entity('import_profiles')
@Index('UQ_import_profiles_userId_name', ['userId', 'name'], { unique: true })
export class ImportProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'jsonb' })
  columns: ImportColumnMapping;

  /** date-fns format for text date cells, e.g. "MMM d, yyyy". */
  @Column({ type: 'varchar', length: 40, default: 'MMM d, yyyy' })
  dateFormat: string;

  /** Rows to skip before the first transaction row (titles, account info, headers). */
  @Column({ type: 'int', default: 1 })
  headerRows: number;

  /** Channel (or "KHQR") -> paymentMethodId. */
  @Column({ type: 'jsonb', default: () => `'{}'` })
  channelPaymentMethods: Partial<Record<PaymentMethodMappingKey, string>>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
