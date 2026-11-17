import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesService } from './categories.service';
import { Category, CategoryType } from './entities/category.entity';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: CATEGORY_ID,
    userId: USER_ID,
    name: 'Food',
    type: CategoryType.EXPENSE,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Category;
}

function uniqueViolation() {
  return new QueryFailedError('INSERT ...', [], {
    code: '23505',
  } as unknown as Error);
}

describe('CategoriesService', () => {
  let service: CategoriesService;
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
      save: jest.fn(async (entity) => ({ id: CATEGORY_ID, ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    auditLogs = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: repo },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  describe('create', () => {
    const dto = { name: 'Food', type: CategoryType.EXPENSE };

    it('creates the category for the user and records an audit entry', async () => {
      const result = await service.create(USER_ID, dto);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, userId: USER_ID });
      expect(result.id).toBe(CATEGORY_ID);
      expect(auditLogs.record).toHaveBeenCalledWith({
        actorUserId: USER_ID,
        action: 'category.created',
        resourceType: 'category',
        resourceId: CATEGORY_ID,
      });
    });

    it('checks the name case-insensitively within user and type', async () => {
      await service.create(USER_ID, dto);

      expect(queryBuilder.where).toHaveBeenCalledWith('c.userId = :userId', {
        userId: USER_ID,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('c.type = :type', {
        type: CategoryType.EXPENSE,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'LOWER(c.name) = LOWER(:name)',
        { name: 'Food' },
      );
    });

    it('throws 409 when the name is already used for that type', async () => {
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
    it('excludes archived categories by default and sorts by type, name', async () => {
      await service.findAllByUser(USER_ID);

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID, isArchived: false },
        order: { type: 'ASC', name: 'ASC' },
      });
    });

    it('filters by type when given', async () => {
      await service.findAllByUser(USER_ID, { type: CategoryType.INCOME });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            type: CategoryType.INCOME,
            isArchived: false,
          },
        }),
      );
    });

    it('includes archived categories when requested', async () => {
      await service.findAllByUser(USER_ID, { includeArchived: true });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });
  });

  describe('findOwned', () => {
    it('queries by both id and userId', async () => {
      repo.findOne.mockResolvedValue(makeCategory());

      await service.findOwned(USER_ID, CATEGORY_ID);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID, userId: USER_ID },
      });
    });

    it('throws 404 when the category does not belong to the user', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOwned(USER_ID, CATEGORY_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue(makeCategory());
    });

    it('keeping the same name skips the uniqueness check', async () => {
      await service.update(USER_ID, CATEGORY_ID, { name: 'Food' });

      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('checks a new name against the existing type, excluding itself', async () => {
      await service.update(USER_ID, CATEGORY_ID, { name: 'Groceries' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('c.type = :type', {
        type: CategoryType.EXPENSE,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('c.id <> :excludeId', {
        excludeId: CATEGORY_ID,
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Groceries' }),
      );
    });

    it('throws 409 when renaming to another category name of the same type', async () => {
      queryBuilder.getExists.mockResolvedValue(true);

      await expect(
        service.update(USER_ID, CATEGORY_ID, { name: 'Transport' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('never changes type even if present on the payload', async () => {
      await service.update(USER_ID, CATEGORY_ID, {
        type: CategoryType.INCOME,
      } as unknown as Parameters<CategoriesService['update']>[2]);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: CategoryType.EXPENSE }),
      );
    });

    it('records an audit log entry', async () => {
      await service.update(USER_ID, CATEGORY_ID, { name: 'Groceries' });

      expect(auditLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.updated' }),
      );
    });

    it('throws 404 for a category the user does not own', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, CATEGORY_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('setArchived', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue(makeCategory());
    });

    it('archives and records category.archived', async () => {
      await service.setArchived(USER_ID, CATEGORY_ID, true);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isArchived: true }),
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.archived' }),
      );
    });

    it('unarchives and records category.unarchived', async () => {
      repo.findOne.mockResolvedValue(makeCategory({ isArchived: true }));

      await service.setArchived(USER_ID, CATEGORY_ID, false);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isArchived: false }),
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.unarchived' }),
      );
    });

    it('throws 404 for a category the user does not own', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.setArchived(USER_ID, CATEGORY_ID, true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
