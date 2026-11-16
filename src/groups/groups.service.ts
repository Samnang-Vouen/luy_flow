import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { fromCents, toCents } from '../common/money.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateGroupContributionDto } from './dto/create-group-contribution.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupContribution } from './entities/group-contribution.entity';
import { GroupMember, GroupMemberRole } from './entities/group-member.entity';
import { Group } from './entities/group.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupsRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly membersRepository: Repository<GroupMember>,
    @InjectRepository(GroupContribution)
    private readonly contributionsRepository: Repository<GroupContribution>,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateGroupDto) {
    const group = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(Group, {
          ownerId: userId,
          name: dto.name,
          description: dto.description ?? null,
          targetAmount:
            dto.targetAmount === undefined || dto.targetAmount === null
              ? null
              : dto.targetAmount.toFixed(2),
        }),
      );
      await manager.save(
        manager.create(GroupMember, {
          groupId: saved.id,
          userId,
          role: GroupMemberRole.OWNER,
        }),
      );
      return saved;
    });
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'group.created',
      resourceType: 'group',
      resourceId: group.id,
    });
    return group;
  }

  /** Groups the user belongs to, with the user's role and the member count. */
  async findAllForUser(userId: string) {
    const memberships = await this.membersRepository.find({
      where: { userId },
    });
    if (memberships.length === 0) return [];

    const groupIds = memberships.map((m) => m.groupId);
    const [groups, allMembers] = await Promise.all([
      this.groupsRepository.find({
        where: { id: In(groupIds) },
        order: { createdAt: 'DESC' },
      }),
      this.membersRepository.find({ where: { groupId: In(groupIds) } }),
    ]);

    return groups.map((group) => ({
      ...group,
      role: memberships.find((m) => m.groupId === group.id)!.role,
      memberCount: allMembers.filter((m) => m.groupId === group.id).length,
    }));
  }

  async findOne(userId: string, groupId: string) {
    const membership = await this.requireMember(userId, groupId);
    const group = await this.findGroup(groupId);
    const members = await this.membersRepository.find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });
    return { ...group, role: membership.role, members };
  }

  async update(userId: string, groupId: string, dto: UpdateGroupDto) {
    await this.requireOwner(userId, groupId);
    const group = await this.findGroup(groupId);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    if (dto.targetAmount !== undefined) {
      group.targetAmount =
        dto.targetAmount === null ? null : dto.targetAmount.toFixed(2);
    }
    const updated = await this.groupsRepository.save(group);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'group.updated',
      resourceType: 'group',
      resourceId: groupId,
    });
    return updated;
  }

  async delete(userId: string, groupId: string) {
    await this.requireOwner(userId, groupId);
    await this.groupsRepository.delete(groupId);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'group.deleted',
      resourceType: 'group',
      resourceId: groupId,
    });
  }

  async addMember(userId: string, groupId: string, dto: AddMemberDto) {
    await this.requireOwner(userId, groupId);
    const group = await this.findGroup(groupId);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('No user with that email');
    }
    const existing = await this.membersRepository.findOne({
      where: { groupId, userId: user.id },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this group');
    }

    const member = await this.membersRepository.save(
      this.membersRepository.create({
        groupId,
        userId: user.id,
        role: GroupMemberRole.MEMBER,
      }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'group.member_added',
      resourceType: 'group',
      resourceId: groupId,
      metadata: { memberUserId: user.id },
    });
    await this.notificationsService.createForUser(user.id, {
      title: 'Added to a group',
      message: `You were added to the group "${group.name}".`,
      metadata: { groupId },
    });
    return member;
  }

  async removeMember(userId: string, groupId: string, targetUserId: string) {
    const caller = await this.requireMember(userId, groupId);
    if (targetUserId !== userId && caller.role !== GroupMemberRole.OWNER) {
      throw new ForbiddenException('Only the group owner can remove members');
    }
    const target = await this.membersRepository.findOne({
      where: { groupId, userId: targetUserId },
    });
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    if (target.role === GroupMemberRole.OWNER) {
      throw new BadRequestException(
        'The owner cannot leave or be removed. Delete the group instead.',
      );
    }
    await this.membersRepository.remove(target);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'group.member_removed',
      resourceType: 'group',
      resourceId: groupId,
      metadata: { memberUserId: targetUserId },
    });
  }

  async contribute(
    userId: string,
    groupId: string,
    dto: CreateGroupContributionDto,
  ) {
    await this.requireMember(userId, groupId);

    const { group, contribution } = await this.dataSource.transaction(
      async (manager) => {
        const locked = await manager.findOne(Group, {
          where: { id: groupId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) {
          throw new NotFoundException('Group not found');
        }
        const saved = await manager.save(
          manager.create(GroupContribution, {
            groupId,
            userId,
            amount: dto.amount.toFixed(2),
            note: dto.note ?? null,
          }),
        );
        locked.currentAmount = fromCents(
          toCents(locked.currentAmount) + toCents(dto.amount),
        );
        await manager.save(locked);
        return { group: locked, contribution: saved };
      },
    );

    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'group.contributed',
      resourceType: 'group',
      resourceId: groupId,
      metadata: { amount: contribution.amount },
    });
    return { group, contribution };
  }

  async findContributions(userId: string, groupId: string) {
    await this.requireMember(userId, groupId);
    return this.contributionsRepository.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Returns 404 for non-members so outsiders cannot learn a group exists. */
  private async requireMember(userId: string, groupId: string) {
    const membership = await this.membersRepository.findOne({
      where: { groupId, userId },
    });
    if (!membership) {
      throw new NotFoundException('Group not found');
    }
    return membership;
  }

  private async requireOwner(userId: string, groupId: string) {
    const membership = await this.requireMember(userId, groupId);
    if (membership.role !== GroupMemberRole.OWNER) {
      throw new ForbiddenException('Only the group owner can do this');
    }
    return membership;
  }

  private async findGroup(groupId: string) {
    const group = await this.groupsRepository.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }
}
