import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('savings_goal_contributions')
export class SavingsGoalContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_savings_goal_contributions_goalId')
  @Column('uuid')
  goalId: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
