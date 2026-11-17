import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesService } from '../categories/categories.service';
import { CategoryType } from '../categories/entities/category.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Budget } from './entities/budget.entity';
import { budgetProgress, BudgetsService, monthRange } from './budgets.service';

describe('BudgetsService', () => {
  const userId = 'owner';
  let service: BudgetsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    remove: jest.Mock;
  };
  let qb: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getRawOne: jest.Mock;
    addSelect: jest.Mock;
    groupBy: jest.Mock;
    addGroupBy: jest.Mock;
    getRawMany: jest.Mock;
  };
  let categories: { findOwned: jest.Mock };
  let audit: { record: jest.Mock };
  const budget = () =>
    ({
      id: 'budget',
      userId,
      amount: '100.00',
      month: '2026-11',
      currency: 'USD',
      categoryId: null,
    }) as Budget;

  beforeEach(() => {
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'budget', ...value })),
      findOne: jest.fn(async () => budget()),
      find: jest.fn(),
      remove: jest.fn(),
    };
    qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ spent: '80.10' })),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    categories = {
      findOwned: jest.fn(async () => ({
        type: CategoryType.EXPENSE,
        isArchived: false,
      })),
    };
    audit = { record: jest.fn() };
    service = new BudgetsService(
      repo as unknown as Repository<Budget>,
      { createQueryBuilder: () => qb } as unknown as Repository<Transaction>,
      categories as unknown as CategoriesService,
      audit as unknown as AuditLogsService,
    );
  });

  it('creates an overall budget with exact decimal storage and audit attribution', async () => {
    const result = await service.create(userId, {
      month: '2026-11',
      currency: 'USD',
      amount: 0.1,
    });
    expect(result.amount).toBe('0.10');
    expect(result.userId).toBe(userId);
    expect(result.categoryId).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        action: 'budget.created',
      }),
    );
  });

  it('calculates all monthly budgets from one grouped spending query without mixing currencies', async () => {
    repo.find.mockResolvedValue([
      budget(),
      { ...budget(), id: 'food-budget', categoryId: 'food' },
      { ...budget(), id: 'khr-budget', currency: 'KHR' },
    ]);
    qb.getRawMany.mockResolvedValue([
      { currency: 'USD', categoryId: 'food', spent: '10.10' },
      { currency: 'USD', categoryId: null, spent: '0.20' },
      { currency: 'KHR', categoryId: 'food', spent: '50' },
    ]);
    const result = await service.monthlyProgress(userId, '2026-11');
    expect(result.map((row) => row.spent)).toEqual(['10.30', '10.10', '50.00']);
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it.each([CategoryType.INCOME, 'archived'])(
    'rejects unusable categories: %s',
    async (kind) => {
      categories.findOwned.mockResolvedValue({
        type: kind === 'archived' ? CategoryType.EXPENSE : kind,
        isArchived: kind === 'archived',
      });
      await expect(
        service.create(userId, {
          month: '2026-11',
          currency: 'USD',
          amount: 10,
          categoryId: 'category',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(categories.findOwned).toHaveBeenCalledWith(userId, 'category');
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for a different user and cannot update or delete their budget', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(
      service.update('other', 'budget', { amount: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete('other', 'budget')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'budget', userId: 'other' },
    });
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('maps concurrent duplicate budgets to 409', async () => {
    repo.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error(), { code: '23505' }),
      ),
    );
    await expect(
      service.create(userId, { month: '2026-11', currency: 'USD', amount: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('filters spending by owner, currency, expense direction, month and optional category', async () => {
    repo.findOne.mockResolvedValue({ ...budget(), categoryId: 'food' });
    const result = await service.progress(userId, 'budget');
    expect(qb.where).toHaveBeenCalledWith('t.userId = :userId', { userId });
    expect(qb.andWhere).toHaveBeenCalledWith("t.type = 'expense'");
    expect(qb.andWhere).toHaveBeenCalledWith('t.currency = :currency', {
      currency: 'USD',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      't.date BETWEEN :dateFrom AND :dateTo',
      { dateFrom: '2026-11-01', dateTo: '2026-11-30' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('t.categoryId = :categoryId', {
      categoryId: 'food',
    });
    expect(result).toMatchObject({
      spent: '80.10',
      remaining: '19.90',
      percentageUsed: '80.10',
      status: 'warning',
    });
  });

  it('allows clearing a category to make an overall budget', async () => {
    repo.findOne.mockResolvedValue({ ...budget(), categoryId: 'food' });
    expect(
      (await service.update(userId, 'budget', { categoryId: null })).categoryId,
    ).toBeNull();
  });

  it.each([
    ['0', 'on_track', '100.00'],
    ['80', 'warning', '20.00'],
    ['100', 'exceeded', '0.00'],
    ['120.01', 'exceeded', '-20.01'],
  ])('handles spending %s', (spent, status, remaining) => {
    expect(budgetProgress(budget(), spent)).toMatchObject({
      status,
      remaining,
    });
  });

  it('handles leap years and rejects invalid months', () => {
    expect(monthRange('2028-02').dateTo).toBe('2028-02-29');
    expect(monthRange('2100-02').dateTo).toBe('2100-02-28');
    expect(monthRange('0099-02').dateTo).toBe('0099-02-28');
    expect(() => monthRange('2026-13')).toThrow(BadRequestException);
    expect(() => monthRange('0000-01')).toThrow(BadRequestException);
  });
});
