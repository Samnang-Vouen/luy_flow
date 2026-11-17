import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService, totals } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let qb: Record<string, jest.Mock>;
  beforeEach(() => {
    qb = {};
    for (const method of [
      'where',
      'andWhere',
      'select',
      'addSelect',
      'groupBy',
      'addGroupBy',
      'orderBy',
      'addOrderBy',
      'leftJoin',
    ])
      qb[method] = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    service = new ReportsService({
      createQueryBuilder: () => qb,
    } as unknown as Repository<Transaction>);
  });

  it('keeps currencies separate and uses owner and inclusive date filters', async () => {
    qb.getRawMany.mockResolvedValue([
      {
        currency: 'KHR',
        income: '10000',
        expenses: '15000',
        transactionCount: '2',
      },
      {
        currency: 'USD',
        income: '0.30',
        expenses: '0.10',
        transactionCount: '3',
      },
    ]);
    const report = await service.summary('owner', {
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      accountId: 'account',
      groupBy: 'month',
    });
    expect(qb.where).toHaveBeenCalledWith('t.userId = :userId', {
      userId: 'owner',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.accountId = :accountId', {
      accountId: 'account',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.date >= :dateFrom', {
      dateFrom: '2026-11-01',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.date <= :dateTo', {
      dateTo: '2026-11-30',
    });
    expect(qb.groupBy).toHaveBeenCalledWith('t.currency');
    expect(report.data[0]).toMatchObject({
      currency: 'KHR',
      surplus: '-5000.00',
      savingsRate: '-50.00',
    });
    expect(report.data[1]).toMatchObject({
      currency: 'USD',
      surplus: '0.20',
      transactionCount: 3,
    });
  });

  it('returns null savings rate for zero income', () => {
    expect(
      totals({
        currency: 'USD',
        income: '0',
        expenses: '20',
        transactionCount: '1',
      }).savingsRate,
    ).toBeNull();
  });

  it('rejects reversed dates before querying', async () => {
    await expect(
      service.summary('owner', {
        dateFrom: '2026-12-01',
        dateTo: '2026-11-01',
        groupBy: 'month',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(qb.getRawMany).not.toHaveBeenCalled();
  });

  it('returns empty data when no transactions match', async () => {
    expect(await service.summary('owner', new ReportQueryDto())).toEqual({
      data: [],
    });
  });

  it('keeps uncategorized entries and normalizes decimal category totals', async () => {
    qb.getRawMany.mockResolvedValue([
      {
        currency: 'USD',
        type: 'expense',
        categoryId: null,
        categoryName: 'Uncategorized',
        amount: '7.1',
        transactionCount: '2',
      },
    ]);
    expect(
      (await service.byCategory('owner', new ReportQueryDto())).data[0],
    ).toMatchObject({ categoryId: null, amount: '7.10', transactionCount: 2 });
    expect(qb.leftJoin).toHaveBeenCalledWith('t.category', 'c');
  });

  it.each(['day', 'week', 'month', 'year'] as const)(
    'supports %s grouping',
    async (groupBy) => {
      await service.trends('owner', { groupBy });
      expect(qb.addGroupBy).toHaveBeenCalledWith(
        expect.stringContaining('t.date'),
      );
    },
  );

  it('rejects arbitrary grouping SQL', async () => {
    await expect(
      service.trends('owner', {
        groupBy: 'DROP TABLE',
      } as unknown as ReportQueryDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
