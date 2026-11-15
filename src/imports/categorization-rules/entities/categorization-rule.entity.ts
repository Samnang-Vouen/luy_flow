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
import { Category } from '../../../categories/entities/category.entity';
import { TransactionType } from '../../../transactions/entities/transaction.entity';
import { User } from '../../../users/entities/user.entity';

/** Learned on confirm: "<counterparty> as <type>" was filed under <category>. */
@Entity('categorization_rules')
@Index(
  'UQ_categorization_rules_userId_type_counterparty',
  ['userId', 'type', 'counterparty'],
  { unique: true },
)
export class CategorizationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'categorization_rules_type_enum',
  })
  type: TransactionType;

  /** Normalized (upper case, single spaces). */
  @Column({ type: 'varchar', length: 120 })
  counterparty: string;

  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
