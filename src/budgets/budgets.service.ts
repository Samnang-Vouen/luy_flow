import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesService } from '../categories/categories.service';
import { CategoryType } from '../categories/entities/category.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/create-budget.dto';
import { Budget } from './entities/budget.entity';

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new BadRequestException(
      'month must be YYYY-MM with a year from 0001 to 9999',
    );
  }
  const [year, number] = month.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    number - 1
  ];
  return { dateFrom: `${month}-01`, dateTo: `${month}-${days}` };
}

export function budgetProgress(budget: Budget, value: string) {
  const spent = new Decimal(value);
  const limit = new Decimal(budget.amount);
  return {
    ...budget,
    spent: spent.toFixed(2),
    remaining: limit.minus(spent).toFixed(2),
    percentageUsed: spent.div(limit).mul(100).toFixed(2),
    status: spent.gte(limit)
      ? 'exceeded'
      : spent.gte(limit.mul('0.8'))
        ? 'warning'
        : 'on_track',
  };
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget) private readonly budgets: Repository<Budget>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    private readonly categories: CategoriesService,
    private readonly audit: AuditLogsService,
  ) {}

  private async validateCategory(
    userId: string,
    categoryId: string | null | undefined,
  ) {
    if (!categoryId) return;
    const category = await this.categories.findOwned(userId, categoryId);
    if (category.isArchived || category.type !== CategoryType.EXPENSE) {
      throw new BadRequestException(
        'Budget category must be an active expense category',
      );
    }
  }

  private async save(budget: Budget) {
    try {
      return await this.budgets.save(budget);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'A budget already exists for this month, currency and category',
        );
      }
      throw error;
    }
  }

  async create(userId: string, dto: CreateBudgetDto) {
    monthRange(dto.month);
    await this.validateCategory(userId, dto.categoryId);
    const budget = await this.save(
      this.budgets.create({
        ...dto,
        userId,
        categoryId: dto.categoryId ?? null,
        amount: new Decimal(dto.amount).toFixed(2),
      }),
    );
    await this.audit.record({
      actorUserId: userId,
      action: 'budget.created',
      resourceType: 'budget',
      resourceId: budget.id,
    });
    return budget;
  }

  findAll(userId: string, month?: string) {
    if (month) monthRange(month);
    return this.budgets.find({
      where: { userId, ...(month ? { month } : {}) },
      order: { month: 'DESC', currency: 'ASC', id: 'ASC' },
    });
  }

  async findOwned(userId: string, id: string) {
    const budget = await this.budgets.findOne({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Budget not found');
    return budget;
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    const budget = await this.findOwned(userId, id);
    if (dto.month !== undefined) {
      monthRange(dto.month);
      budget.month = dto.month;
    }
    if (dto.currency !== undefined) budget.currency = dto.currency;
    if (dto.amount !== undefined)
      budget.amount = new Decimal(dto.amount).toFixed(2);
    if (dto.categoryId !== undefined && dto.categoryId !== budget.categoryId) {
      await this.validateCategory(userId, dto.categoryId);
      budget.categoryId = dto.categoryId;
    }
    const saved = await this.save(budget);
    await this.audit.record({
      actorUserId: userId,
      action: 'budget.updated',
      resourceType: 'budget',
      resourceId: id,
    });
    return saved;
  }

  async delete(userId: string, id: string) {
    await this.budgets.remove(await this.findOwned(userId, id));
    await this.audit.record({
      actorUserId: userId,
      action: 'budget.deleted',
      resourceType: 'budget',
      resourceId: id,
    });
  }

  async progress(userId: string, id: string) {
    const budget = await this.findOwned(userId, id);
    const range = monthRange(budget.month);
    const qb = this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'spent')
      .where('t.userId = :userId', { userId })
      .andWhere("t.type = 'expense'")
      .andWhere('t.currency = :currency', { currency: budget.currency })
      .andWhere('t.date BETWEEN :dateFrom AND :dateTo', range);
    if (budget.categoryId)
      qb.andWhere('t.categoryId = :categoryId', {
        categoryId: budget.categoryId,
      });
    const row = await qb.getRawOne<{ spent: string }>();
    return budgetProgress(budget, row?.spent ?? '0');
  }

  async monthlyProgress(userId: string, month: string) {
    const range = monthRange(month);
    const budgets = await this.findAll(userId, month);
    if (budgets.length === 0) return [];
    // One aggregation for all budgets, rather than a query for each category.
    const spending = await this.transactions
      .createQueryBuilder('t')
      .select('t.currency', 'currency')
      .addSelect('t.categoryId', 'categoryId')
      .addSelect('SUM(t.amount)', 'spent')
      .where('t.userId = :userId', { userId })
      .andWhere("t.type = 'expense'")
      .andWhere('t.date BETWEEN :dateFrom AND :dateTo', range)
      .groupBy('t.currency')
      .addGroupBy('t.categoryId')
      .getRawMany<{
        currency: string;
        categoryId: string | null;
        spent: string;
      }>();
    return budgets.map((budget) => {
      const spent = spending
        .filter(
          (row) =>
            row.currency === budget.currency &&
            (budget.categoryId === null ||
              row.categoryId === budget.categoryId),
        )
        .reduce((sum, row) => sum.plus(row.spent), new Decimal(0));
      return budgetProgress(budget, spent.toFixed(2));
    });
  }
}
