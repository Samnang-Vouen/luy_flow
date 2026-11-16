import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { DebtDirection, DebtStatus } from './entities/debt.entity';

describe('DebtsService', () => {
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
  const service = new DebtsService(
    {} as never,
    {} as never,
    dataSource as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => jest.clearAllMocks());

  const debt = (over = {}) => ({
    id: 'd1',
    userId: 'u1',
    counterparty: 'Sokha',
    direction: DebtDirection.OWED_BY_ME,
    principalAmount: '100.00',
    remainingAmount: '100.00',
    status: DebtStatus.ACTIVE,
    ...over,
  });

  it('reduces the remaining amount on a partial payment', async () => {
    manager.findOne.mockResolvedValue(debt());
    const res = await service.pay('u1', 'd1', { amount: 30 });
    expect(res.debt.remainingAmount).toBe('70.00');
    expect(res.debt.status).toBe(DebtStatus.ACTIVE);
    expect(notifications.createForUser).not.toHaveBeenCalled();
  });

  it('marks the debt paid and notifies when fully paid', async () => {
    manager.findOne.mockResolvedValue(debt({ remainingAmount: '25.00' }));
    const res = await service.pay('u1', 'd1', { amount: 25 });
    expect(res.debt.remainingAmount).toBe('0.00');
    expect(res.debt.status).toBe(DebtStatus.PAID);
    expect(notifications.createForUser).toHaveBeenCalledTimes(1);
  });

  it('rejects a payment larger than the remaining amount', async () => {
    manager.findOne.mockResolvedValue(debt({ remainingAmount: '20.00' }));
    await expect(service.pay('u1', 'd1', { amount: 20.01 })).rejects.toThrow(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a payment on a paid debt', async () => {
    manager.findOne.mockResolvedValue(debt({ status: DebtStatus.PAID }));
    await expect(service.pay('u1', 'd1', { amount: 1 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns 404 for a debt owned by someone else', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.pay('u2', 'd1', { amount: 1 })).rejects.toThrow(
      NotFoundException,
    );
  });
});
