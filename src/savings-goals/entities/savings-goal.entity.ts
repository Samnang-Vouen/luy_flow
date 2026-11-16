import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SavingsGoalStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('savings_goals')
export class SavingsGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_savings_goals_userId')
  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  targetAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  currentAmount: string;

  @Column({ type: 'date', nullable: true })
  targetDate: string | null;

  @Column({
    type: 'enum',
    enum: SavingsGoalStatus,
    default: SavingsGoalStatus.ACTIVE,
  })
  status: SavingsGoalStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
