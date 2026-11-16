import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('group_contributions')
export class GroupContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_group_contributions_groupId')
  @Column('uuid')
  groupId: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
