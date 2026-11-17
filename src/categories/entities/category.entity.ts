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

export enum CategoryType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

@Entity('categories')
@Index(['userId', 'type', 'name'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  /** Immutable after creation so existing transactions keep a matching category. */
  @Column({ type: 'enum', enum: CategoryType })
  type: CategoryType;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
