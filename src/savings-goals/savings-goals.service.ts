import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { fromCents, toCents } from '../common/money.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ContributeDto } from './dto/contribute.dto';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';
import { SavingsGoalContribution } from './entities/savings-goal-contribution.entity';
import { SavingsGoal, SavingsGoalStatus } from './entities/savings-goal.entity';

@Injectable()
export class SavingsGoalsService {
  constructor(
    @InjectRepository(SavingsGoal)
    private readonly goalsRepository: Repository<SavingsGoal>,
    @InjectRepository(SavingsGoalContribution)
    private readonly contributionsRepository: Repository<SavingsGoalContribution>,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateSavingsGoalDto) {
    const goal = await this.goalsRepository.save(
      this.goalsRepository.create({
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount.toFixed(2),
        targetDate: dto.targetDate ?? null,
      }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'savings_goal.created',
      resourceType: 'savings_goal',
      resourceId: goal.id,
      metadata: { targetAmount: goal.targetAmount },
    });
    return goal;
  }

  findAll(userId: string) {
    return this.goalsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwned(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto) {
    const goal = await this.findOwned(userId, id);
    if (dto.name !== undefined) goal.name = dto.name;
    if (dto.targetAmount !== undefined) {
      goal.targetAmount = dto.targetAmount.toFixed(2);
    }
    if (dto.targetDate !== undefined) goal.targetDate = dto.targetDate;
    if (dto.status !== undefined) goal.status = dto.status;

    if (goal.status !== SavingsGoalStatus.CANCELLED) {
      const reached = toCents(goal.currentAmount) >= toCents(goal.targetAmount);
      goal.status = reached
        ? SavingsGoalStatus.COMPLETED
        : SavingsGoalStatus.ACTIVE;
    }

    const updated = await this.goalsRepository.save(goal);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'savings_goal.updated',
      resourceType: 'savings_goal',
      resourceId: id,
    });
    return updated;
  }

  async delete(userId: string, id: string) {
    const goal = await this.findOwned(userId, id);
    await this.goalsRepository.remove(goal);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'savings_goal.deleted',
      resourceType: 'savings_goal',
      resourceId: id,
    });
  }

  async contribute(userId: string, id: string, dto: ContributeDto) {
    const { goal, contribution, justCompleted } =
      await this.dataSource.transaction(async (manager) => {
        const locked = await manager.findOne(SavingsGoal, {
          where: { id, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) {
          throw new NotFoundException('Savings goal not found');
        }
        if (locked.status !== SavingsGoalStatus.ACTIVE) {
          throw new BadRequestException('Savings goal is not active');
        }

        const saved = await manager.save(
          manager.create(SavingsGoalContribution, {
            goalId: id,
            userId,
            amount: dto.amount.toFixed(2),
            note: dto.note ?? null,
            accountId: dto.accountId ?? null,
          }),
        );

        const total = toCents(locked.currentAmount) + toCents(dto.amount);
        locked.currentAmount = fromCents(total);
        const reached = total >= toCents(locked.targetAmount);
        if (reached) locked.status = SavingsGoalStatus.COMPLETED;
        await manager.save(locked);

        return { goal: locked, contribution: saved, justCompleted: reached };
      });

    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'savings_goal.contributed',
      resourceType: 'savings_goal',
      resourceId: id,
      metadata: { amount: contribution.amount },
    });
    if (justCompleted) {
      await this.notificationsService.createForUser(userId, {
        title: 'Savings goal reached',
        message: `You reached your goal "${goal.name}".`,
        metadata: { goalId: id },
      });
    }
    return { goal, contribution };
  }

  async findContributions(userId: string, id: string) {
    await this.findOwned(userId, id);
    return this.contributionsRepository.find({
      where: { goalId: id },
      order: { createdAt: 'DESC' },
    });
  }

  private async findOwned(userId: string, id: string) {
    const goal = await this.goalsRepository.findOne({ where: { id, userId } });
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }
    return goal;
  }
}
