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
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('budgets')
@Check('CHK_budgets_amount_positive', '"amount" > 0')
@Check('CHK_budgets_month', `"month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`)
@Index('IDX_budgets_userId_month', ['userId', 'month'])
@Index('UQ_budgets_overall', ['userId', 'month', 'currency'], {
  unique: true,
  where: '"categoryId" IS NULL',
})
@Index('UQ_budgets_category', ['userId', 'month', 'currency', 'categoryId'], {
  unique: true,
  where: '"categoryId" IS NOT NULL',
})
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // RESTRICT prevents category deletion silently turning this into an overall budget.
  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

  @Column({ type: 'varchar', length: 7 })
  month: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
