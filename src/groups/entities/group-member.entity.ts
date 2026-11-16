import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum GroupMemberRole {
  OWNER = 'owner',
  MEMBER = 'member',
}

@Entity('group_members')
@Unique('UQ_group_members_groupId_userId', ['groupId', 'userId'])
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  groupId: string;

  @Index('IDX_group_members_userId')
  @Column('uuid')
  userId: string;

  @Column({
    type: 'enum',
    enum: GroupMemberRole,
    default: GroupMemberRole.MEMBER,
  })
  role: GroupMemberRole;

  @CreateDateColumn()
  joinedAt: Date;
}
