import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { SavingsGoalsService } from './savings-goals.service';
import { SavingsGoalStatus } from './entities/savings-goal.entity';

describe('SavingsGoalsService', () => {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_: unknown, v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
  };
  const audit = { record: jest.fn() };
  const notifications = { createForUser: jest.fn() };
  const service = new SavingsGoalsService(
    {} as never,
    {} as never,
    dataSource as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => jest.clearAllMocks());

  const goal = (over = {}) => ({
    id: 'g1',
    userId: 'u1',
    name: 'Laptop',
    targetAmount: '100.00',
    currentAmount: '40.00',
    status: SavingsGoalStatus.ACTIVE,
    ...over,
  });

  it('adds the amount and keeps the goal active below target', async () => {
    manager.findOne.mockResolvedValue(goal());
    const res = await service.contribute('u1', 'g1', { amount: 10.5 });
    expect(res.goal.currentAmount).toBe('50.50');
    expect(res.goal.status).toBe(SavingsGoalStatus.ACTIVE);
    expect(notifications.createForUser).not.toHaveBeenCalled();
  });

  it('completes the goal and notifies when the target is reached', async () => {
    manager.findOne.mockResolvedValue(goal());
    const res = await service.contribute('u1', 'g1', { amount: 60 });
    expect(res.goal.currentAmount).toBe('100.00');
    expect(res.goal.status).toBe(SavingsGoalStatus.COMPLETED);
    expect(notifications.createForUser).toHaveBeenCalledTimes(1);
  });

  it('rejects a contribution to a goal that is not active', async () => {
    manager.findOne.mockResolvedValue(
      goal({ status: SavingsGoalStatus.CANCELLED }),
    );
    await expect(service.contribute('u1', 'g1', { amount: 5 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns 404 for a goal owned by someone else', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.contribute('u2', 'g1', { amount: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('does not add floating point error to the balance', async () => {
    manager.findOne.mockResolvedValue(goal({ currentAmount: '0.10' }));
    const res = await service.contribute('u1', 'g1', { amount: 0.2 });
    expect(res.goal.currentAmount).toBe('0.30');
  });

  it('accepts a contribution in the goal currency', async () => {
    manager.findOne.mockResolvedValue(goal({ currency: 'KHR' }));
    const res = await service.contribute('u1', 'g1', {
      amount: 5000,
      currency: 'KHR',
    });
    expect(res.goal.currentAmount).toBe('5040.00');
  });

  it('rejects a contribution in a different currency with 422', async () => {
    manager.findOne.mockResolvedValue(goal({ currency: 'USD' }));
    await expect(
      service.contribute('u1', 'g1', { amount: 5000, currency: 'KHR' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('SavingsGoalsService.create', () => {
  const goalsRepository = {
    findOne: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    create: jest.fn((v: unknown) => v),
    save: jest.fn<(v: unknown) => Promise<unknown>>(),
  };
  const audit = { record: jest.fn() };
  const service = new SavingsGoalsService(
    goalsRepository as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    goalsRepository.save.mockImplementation(async (v) => ({ id: 'g1', ...(v as object) }));
  });

  const tripRef = { source: 'tripsplit', id: 'trip-1' };

  it('defaults the currency to USD and stores no externalRef', async () => {
    const res = await service.create('u1', { name: 'Laptop', targetAmount: 100 });
    expect(res).toMatchObject({
      currency: 'USD',
      externalSource: null,
      externalId: null,
    });
    expect(goalsRepository.findOne).not.toHaveBeenCalled();
  });

  it('stores the currency and externalRef', async () => {
    goalsRepository.findOne.mockResolvedValue(null);
    const res = await service.create('u1', {
      name: 'Kampot trip',
      targetAmount: 800000,
      currency: 'KHR',
      externalRef: tripRef,
    });
    expect(res).toMatchObject({
      targetAmount: '800000.00',
      currency: 'KHR',
      externalSource: 'tripsplit',
      externalId: 'trip-1',
    });
  });

  it('returns 409 with the existing goal when the externalRef is taken', async () => {
    const existing = { id: 'g0', externalSource: 'tripsplit', externalId: 'trip-1' };
    goalsRepository.findOne.mockResolvedValue(existing);
    const err = await service
      .create('u1', { name: 'Kampot trip', targetAmount: 200, externalRef: tripRef })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ goal: existing });
    expect(goalsRepository.save).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent request wins the unique index', async () => {
    const existing = { id: 'g0', externalSource: 'tripsplit', externalId: 'trip-1' };
    goalsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    goalsRepository.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' })),
    );
    await expect(
      service.create('u1', { name: 'Kampot trip', targetAmount: 200, externalRef: tripRef }),
    ).rejects.toThrow(ConflictException);
  });
});
