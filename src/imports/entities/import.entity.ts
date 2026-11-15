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
import { Account } from '../../accounts/entities/account.entity';
import { User } from '../../users/entities/user.entity';
import { ImportProfile } from '../import-profiles/entities/import-profile.entity';

export enum ImportStatus {
  /** Queued; the worker is parsing the file and building the preview. */
  PROCESSING = 'processing',
  PREVIEW = 'preview',
  /** Confirm queued; the worker is creating the transactions. */
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  UNDONE = 'undone',
}

@Entity('imports')
@Index('IDX_imports_userId_createdAt', ['userId', 'createdAt'])
@Index('IDX_imports_accountId_fileHash', ['accountId', 'fileHash'])
export class Import {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: Account;

  @Column({ type: 'uuid', nullable: true })
  profileId: string | null;

  @ManyToOne(() => ImportProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'profileId' })
  profile: ImportProfile | null;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 10 })
  fileType: string;

  /** SHA-256 of the file, to warn when the same statement is uploaded twice. */
  @Column({ type: 'char', length: 64 })
  fileHash: string;

  @Column({ type: 'bytea', nullable: true, select: false })
  fileContent: Buffer | null;

  @Column({
    type: 'enum',
    enum: ImportStatus,
    enumName: 'imports_status_enum',
    default: ImportStatus.PROCESSING,
  })
  status: ImportStatus;

  /** Why the last background step failed, shown to the user. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  validRows: number;

  @Column({ type: 'int', default: 0 })
  invalidRows: number;

  @Column({ type: 'int', default: 0 })
  duplicateRows: number;

  @Column({ type: 'int', default: 0 })
  importedRows: number;

  /** Balance before the statement's first transaction, derived from the Balance column. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  statementOpeningBalance: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  statementClosingBalance: string | null;

  /** File-level warnings, e.g. the same file was already imported. */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  warnings: string[];

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
