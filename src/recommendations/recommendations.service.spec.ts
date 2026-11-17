import { BudgetsService } from '../budgets/budgets.service';
import { ReportsService } from '../reports/reports.service';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  let reports: { summary: jest.Mock; byCategory: jest.Mock };
  let budgets: { monthlyProgress: jest.Mock };
  let service: RecommendationsService;
  beforeEach(() => {
    reports = {
      summary: jest.fn().mockResolvedValue({ data: [] }),
      byCategory: jest.fn().mockResolvedValue({ data: [] }),
    };
    budgets = { monthlyProgress: jest.fn().mockResolvedValue([]) };
    service = new RecommendationsService(
      reports as unknown as ReportsService,
      budgets as unknown as BudgetsService,
    );
  });

  it('detects a 50% category increase using the same currency and owner', async () => {
    reports.byCategory
      .mockResolvedValueOnce({
        data: [
          {
            currency: 'USD',
            categoryId: 'food',
            categoryName: 'Food',
            type: 'expense',
            amount: '150.00',
          },
          {
            currency: 'KHR',
            categoryId: 'food',
            categoryName: 'Food',
            type: 'expense',
            amount: '100.00',
          },
          {
            currency: 'USD',
            categoryId: 'salary',
            categoryName: 'Salary',
            type: 'income',
            amount: '9999.00',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            currency: 'USD',
            categoryId: 'food',
            type: 'expense',
            amount: '100.00',
          },
          {
            currency: 'KHR',
            categoryId: 'food',
            type: 'expense',
            amount: '200.00',
          },
          {
            currency: 'USD',
            categoryId: 'salary',
            type: 'income',
            amount: '1.00',
          },
        ],
      });
    const result = await service.findAll('owner', '2026-11');
    const alerts = result.recommendations.filter(
      (row) => row.code === 'UNUSUAL_CATEGORY_SPENDING',
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      currency: 'USD',
      categoryId: 'food',
      amount: '150.00',
      baselineMonth: '2026-10',
      baselineAmount: '100.00',
      increasePercentage: '50.00',
    });
    expect(reports.byCategory).toHaveBeenNthCalledWith(1, 'owner', {
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      groupBy: 'month',
    });
    expect(reports.byCategory).toHaveBeenNthCalledWith(2, 'owner', {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      groupBy: 'month',
    });
  });

  it('does not flag new categories, zero baselines or increases below 50%', async () => {
    reports.byCategory
      .mockResolvedValueOnce({
        data: [
          {
            currency: 'USD',
            categoryId: 'food',
            type: 'expense',
            amount: '149.99',
          },
          {
            currency: 'USD',
            categoryId: 'new',
            type: 'expense',
            amount: '1000.00',
          },
          {
            currency: 'USD',
            categoryId: 'zero',
            type: 'expense',
            amount: '1000.00',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            currency: 'USD',
            categoryId: 'food',
            type: 'expense',
            amount: '100.00',
          },
          {
            currency: 'USD',
            categoryId: 'zero',
            type: 'expense',
            amount: '0.00',
          },
        ],
      });
    expect((await service.findAll('owner', '2026-11')).recommendations).toEqual(
      [],
    );
  });

  it('compares January with December of the previous year', async () => {
    await service.findAll('owner', '2026-01');
    expect(reports.byCategory).toHaveBeenCalledWith('owner', {
      dateFrom: '2025-12-01',
      dateTo: '2025-12-31',
      groupBy: 'month',
    });
  });

  it('handles the earliest supported month without an invalid baseline', async () => {
    await service.findAll('owner', '0001-01');
    expect(reports.byCategory).not.toHaveBeenCalled();
  });

  it('does not invent recommendations when there is no activity', async () => {
    expect(await service.findAll('owner', '2026-11')).toMatchObject({
      hasTransactions: false,
      recommendations: [],
    });
    expect(reports.summary).toHaveBeenCalledWith('owner', {
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      groupBy: 'month',
    });
  });

  it('caps savings at recorded surplus and evaluates currencies independently', async () => {
    reports.summary.mockResolvedValue({
      data: [
        { currency: 'USD', income: '100', surplus: '5' },
        { currency: 'KHR', income: '1000', surplus: '-300' },
      ],
    });
    const result = await service.findAll('owner', '2026-11');
    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SAVINGS_OPPORTUNITY',
          currency: 'USD',
          amount: '5.00',
        }),
        expect.objectContaining({
          code: 'SPENDING_EXCEEDS_INCOME',
          currency: 'KHR',
          amount: '300.00',
        }),
      ]),
    );
    expect(
      result.recommendations.filter(
        (item) => item.code === 'SAVINGS_OPPORTUNITY',
      ),
    ).toHaveLength(1);
  });

  it('warns at budget thresholds and does not duplicate existing overall budget advice', async () => {
    reports.summary.mockResolvedValue({
      data: [{ currency: 'USD', income: '100', surplus: '50' }],
    });
    budgets.monthlyProgress.mockResolvedValue([
      { id: 'b', categoryId: null, currency: 'USD', status: 'warning' },
    ]);
    const result = await service.findAll('owner', '2026-11');
    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BUDGET_NEAR_LIMIT', budgetId: 'b' }),
        expect.objectContaining({
          code: 'SAVINGS_OPPORTUNITY',
          amount: '20.00',
        }),
      ]),
    );
    expect(
      result.recommendations.some((item) => item.code === 'SET_MONTHLY_BUDGET'),
    ).toBe(false);
  });
});
