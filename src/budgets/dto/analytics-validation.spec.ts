import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReportQueryDto } from '../../reports/dto/report-query.dto';
import { RecommendationsQueryDto } from '../../recommendations/dto/recommendations-query.dto';
import { CreateBudgetDto, UpdateBudgetDto } from './create-budget.dto';

describe('Analytics input validation', () => {
  const valid = { month: '2026-11', currency: 'usd', amount: 100 };
  it('normalizes currency and accepts an overall budget', async () => {
    const dto = plainToInstance(CreateBudgetDto, valid);
    expect(await validate(dto)).toEqual([]);
    expect(dto.currency).toBe('USD');
  });
  it.each([
    { amount: 0 },
    { amount: -1 },
    { amount: 1.001 },
    { amount: '10' },
    { amount: null },
    { amount: 1e12 },
    { month: '2026-13' },
    { currency: 'invalid' },
    { currency: 'ZZZ' },
    { categoryId: 'bad' },
  ])('rejects invalid budget fields: %j', async (override) => {
    expect(
      (
        await validate(
          plainToInstance(CreateBudgetDto, { ...valid, ...override }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each(['amount', 'currency', 'month'])(
    'rejects null %s in partial updates',
    async (field) => {
      expect(
        (await validate(plainToInstance(UpdateBudgetDto, { [field]: null })))
          .length,
      ).toBeGreaterThan(0);
    },
  );
  it('accepts an empty PATCH and clearing the category', async () => {
    expect(await validate(plainToInstance(UpdateBudgetDto, {}))).toEqual([]);
    expect(
      await validate(plainToInstance(UpdateBudgetDto, { categoryId: null })),
    ).toEqual([]);
  });
  it.each([
    { dateFrom: '2026-02-30' },
    { dateTo: '2026-11-01T00:00:00Z' },
    { groupBy: 'invalid' },
    { accountId: 'bad' },
  ])('rejects invalid report filters: %j', async (input) => {
    expect(
      (await validate(plainToInstance(ReportQueryDto, input))).length,
    ).toBeGreaterThan(0);
  });
  it('requires a valid month for recommendations', async () => {
    expect(
      (await validate(new RecommendationsQueryDto())).length,
    ).toBeGreaterThan(0);
    expect(
      await validate(
        plainToInstance(RecommendationsQueryDto, { month: '2026-11' }),
      ),
    ).toEqual([]);
  });
});
