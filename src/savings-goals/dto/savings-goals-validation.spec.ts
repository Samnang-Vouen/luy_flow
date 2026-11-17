import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContributeDto } from './contribute.dto';
import { CreateSavingsGoalDto } from './create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './update-savings-goal.dto';

// Mirrors the global ValidationPipe({ whitelist: true, transform: true }) in main.ts.
const check = async <T extends object>(cls: new () => T, input: object) => {
  const dto = plainToInstance(cls, input);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
};

describe('Savings goal input validation', () => {
  const valid = { name: 'Kampot trip', targetAmount: 200 };

  it('accepts a goal without currency or externalRef', async () => {
    const { dto, errors } = await check(CreateSavingsGoalDto, valid);
    expect(errors).toEqual([]);
    expect(dto.currency).toBeUndefined();
    expect(dto.externalRef).toBeUndefined();
  });

  it('normalizes the currency and accepts an externalRef', async () => {
    const { dto, errors } = await check(CreateSavingsGoalDto, {
      ...valid,
      currency: ' khr ',
      externalRef: { source: 'tripsplit', id: 'trip-123' },
    });
    expect(errors).toEqual([]);
    expect(dto.currency).toBe('KHR');
    expect(dto.externalRef).toEqual({ source: 'tripsplit', id: 'trip-123' });
  });

  it.each([
    { currency: 'ZZZ' },
    { currency: 'dollars' },
    { currency: 840 },
    { externalRef: 'tripsplit:1' },
    { externalRef: { source: 'TripSplit', id: '1' } },
    { externalRef: { source: 'trip split', id: '1' } },
    { externalRef: { source: 'x'.repeat(41), id: '1' } },
    { externalRef: { source: 'tripsplit' } },
    { externalRef: { source: 'tripsplit', id: '' } },
    { externalRef: { source: 'tripsplit', id: 'x'.repeat(101) } },
  ])('rejects invalid goal fields: %j', async (override) => {
    const { errors } = await check(CreateSavingsGoalDto, { ...valid, ...override });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('drops currency and externalRef from a PATCH', async () => {
    const { dto, errors } = await check(UpdateSavingsGoalDto, {
      name: 'Renamed',
      currency: 'KHR',
      externalRef: { source: 'tripsplit', id: 'other' },
    });
    expect(errors).toEqual([]);
    expect(dto).toEqual({ name: 'Renamed' });
  });

  it('accepts a contribution with or without a currency', async () => {
    expect((await check(ContributeDto, { amount: 20 })).errors).toEqual([]);
    const { dto, errors } = await check(ContributeDto, { amount: 20, currency: 'usd' });
    expect(errors).toEqual([]);
    expect(dto.currency).toBe('USD');
  });

  it('rejects a contribution with an invalid currency', async () => {
    const { errors } = await check(ContributeDto, { amount: 20, currency: 'ZZZ' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
