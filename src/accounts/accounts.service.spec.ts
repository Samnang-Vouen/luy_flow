import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountsService } from './accounts.service';
import { Account, AccountType } from './entities/account.entity';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: ACCOUNT_ID,
    userId: USER_ID,
    name: 'Wallet',
    type: AccountType.CASH,
    currency: 'USD',
    openingBalance: '0.00',
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Account;
}

function uniqueViolation() {
  return new QueryFailedError('INSERT ...', [], {
    code: '23505',
  } as unknown as Error);
}

describe('AccountsService', () => {
  let service: AccountsService;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getExists: jest.Mock;
  };
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let auditLogs: { record: jest.Mock };

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    repo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (entity) => ({ id: ACCOUNT_ID, ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    auditLogs = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getRepositoryToken(Account), useValue: repo },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = moduleRef.get(AccountsService);
  });

  describe('create', () => {
    const dto = { name: 'ABA', type: AccountType.BANK, currency: 'USD' };

    it('defaults openingBalance to "0.00" and assigns the user', async () => {
      await service.create(USER_ID, dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ openingBalance: '0.00', userId: USER_ID }),
      );
    });

    it('stores openingBalance with two decimals, including negatives', async () => {
      await service.create(USER_ID, { ...dto, openingBalance: -12.5 });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ openingBalance: '-12.50' }),
      );
    });

    it('records an audit log entry', async () => {
      await service.create(USER_ID, dto);

      expect(auditLogs.record).toHaveBeenCalledWith({
        actorUserId: USER_ID,
        action: 'account.created',
        resourceType: 'account',
        resourceId: ACCOUNT_ID,
      });
    });

    it('checks the name case-insensitively within the user scope', async () => {
      await service.create(USER_ID, dto);

      expect(queryBuilder.where).toHaveBeenCalledWith('a.userId = :userId', {
        userId: USER_ID,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'LOWER(a.name) = LOWER(:name)',
        { name: 'ABA' },
      );
    });

    it('throws 409 when the name is already used', async () => {
      queryBuilder.getExists.mockResolvedValue(true);

      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(auditLogs.record).not.toHaveBeenCalled();
    });

    it('maps a DB unique violation (race condition) to 409', async () => {
      repo.save.mockRejectedValue(uniqueViolation());

      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows other database errors unchanged', async () => {
      const error = new Error('connection lost');
      repo.save.mockRejectedValue(error);

      await expect(service.create(USER_ID, dto)).rejects.toBe(error);
    });
  });

  describe('findAllByUser', () => {
    it('excludes archived accounts by default', async () => {
      await service.findAllByUser(USER_ID);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, isArchived: false },
        }),
      );
    });

    it('includes archived accounts when requested', async () => {
      await service.findAllByUser(USER_ID, true);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });
  });

  describe('findOwned', () => {
    it('queries by both id and userId', async () => {
      repo.findOne.mockResolvedValue(makeAccount());

      await service.findOwned(USER_ID, ACCOUNT_ID);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID, userId: USER_ID },
      });
    });

    it('throws 404 when the account does not belong to the user', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOwned(USER_ID, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue(makeAccount());
    });

    it('allows keeping the same name without a uniqueness check', async () => {
      await service.update(USER_ID, ACCOUNT_ID, { name: 'Wallet' });

      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('excludes the account itself when checking a new name', async () => {
      await service.update(USER_ID, ACCOUNT_ID, { name: 'Cash box' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('a.id <> :excludeId', {
        excludeId: ACCOUNT_ID,
      });
    });

    it('throws 409 when renaming to another account name', async () => {
      queryBuilder.getExists.mockResolvedValue(true);

      await expect(
        service.update(USER_ID, ACCOUNT_ID, { name: 'Savings' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('applies only provided fields and formats openingBalance', async () => {
      await service.update(USER_ID, ACCOUNT_ID, { openingBalance: 99.9 });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Wallet',
          type: AccountType.CASH,
          currency: 'USD',
          openingBalance: '99.90',
        }),
      );
    });

    it('never changes currency even if present on the payload', async () => {
      await service.update(USER_ID, ACCOUNT_ID, {
        currency: 'KHR',
      } as unknown as Parameters<AccountsService['update']>[2]);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'USD' }),
      );
    });

    it('records an audit log entry', async () => {
      await service.update(USER_ID, ACCOUNT_ID, { type: AccountType.BANK });

      expect(auditLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.updated' }),
      );
    });

    it('throws 404 for an account the user does not own', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, ACCOUNT_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('setArchived', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue(makeAccount());
    });

    it('archives and records account.archived', async () => {
      await service.setArchived(USER_ID, ACCOUNT_ID, true);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isArchived: true }),
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.archived' }),
      );
    });

    it('unarchives and records account.unarchived', async () => {
      repo.findOne.mockResolvedValue(makeAccount({ isArchived: true }));

      await service.setArchived(USER_ID, ACCOUNT_ID, false);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isArchived: false }),
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.unarchived' }),
      );
    });

    it('throws 404 for an account the user does not own', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.setArchived(USER_ID, ACCOUNT_ID, true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
