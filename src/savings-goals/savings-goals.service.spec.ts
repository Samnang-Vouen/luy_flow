import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
});
