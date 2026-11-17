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
@Index(
  'UQ_savings_goals_userId_externalRef',
  ['userId', 'externalSource', 'externalId'],
  { unique: true, where: '"externalSource" IS NOT NULL' },
)
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

  /** ISO 4217 code. Fixed at creation; contributions must use the same currency. */
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  /** App that created this goal through the API, e.g. 'tripsplit'. Null for goals made in LuyFlow. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  externalSource: string | null;

  /** The source app's own ID for what this goal is for, e.g. a TripSplit trip ID. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId: string | null;

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
