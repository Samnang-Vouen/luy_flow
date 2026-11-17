import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import {
  Between,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { Account } from '../accounts/entities/account.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesService } from '../categories/categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import {
  CreateTransactionDto,
  DATE_ONLY_PATTERN,
} from './dto/create-transaction.dto';
import {
  ListTransactionsQueryDto,
  TransactionSortBy,
} from './dto/list-transactions-query.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  Transaction,
  TransactionSource,
  TransactionType,
} from './entities/transaction.entity';

// Whitelist of sortable columns: user input never reaches ORDER BY directly.
const SORT_COLUMNS: Record<TransactionSortBy, string> = {
  [TransactionSortBy.DATE]: 't.date',
  [TransactionSortBy.AMOUNT]: 't.amount',
  [TransactionSortBy.CREATED_AT]: 't.createdAt',
};

const PG_UNIQUE_VIOLATION = '23505';
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** One row to create via createMany()*/
export interface ImportedTransactionInput {
  /** Statement row number, used in error messages. */
  rowNumber?: number;
  type: TransactionType;
  amount: string;
  /** YYYY-MM-DD */
  date: string;
  description?: string | null;
  categoryId?: string | null;
  paymentMethodId?: string | null;
  externalRef?: string | null;
  rawDetails?: string | null;
}

export type TransactionFilters = Omit<
  ListTransactionsQueryDto,
  'page' | 'limit' | 'sortBy' | 'sortOrder'
>;

export interface TransactionExportRow {
  /** YYYY-MM-DD */
  date: string;
  type: TransactionType;
  /** Decimal string, e.g. "500.00" */
  amount: string;
  currency: string;
  description: string | null;
  accountName: string;
  categoryName: string | null;
  paymentMethodName: string | null;
}

export type DuplicateCheckCandidate = Pick<
  Transaction,
  'id' | 'type' | 'amount' | 'date' | 'description' | 'externalRef'
>;

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(userId: string, dto: CreateTransactionDto) {
    const account = await this.getActiveAccount(userId, dto.accountId);
    if (dto.categoryId) {
      await this.assertCategoryUsable(userId, dto.categoryId, dto.type, true);
    }
    if (dto.paymentMethodId) {
      await this.assertPaymentMethodUsable(userId, dto.paymentMethodId);
    }

    const transaction = await this.transactionsRepository.save(
      this.transactionsRepository.create({
        userId,
        accountId: account.id,
        currency: account.currency,
        categoryId: dto.categoryId ?? null,
        paymentMethodId: dto.paymentMethodId ?? null,
        type: dto.type,
        amount: dto.amount.toFixed(2),
        date: dto.date,
        description: this.normalizeDescription(dto.description),
      }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'transaction.created',
      resourceType: 'transaction',
      resourceId: transaction.id,
    });
    return transaction;
  }

  async findAll(userId: string, query: ListTransactionsQueryDto) {
    const qb = this.buildFilteredQuery(userId, query);

    // Secondary keys keep the order stable across pages when values tie.
    qb.orderBy(SORT_COLUMNS[query.sortBy], query.sortOrder)
      .addOrderBy('t.createdAt', query.sortOrder)
      .addOrderBy('t.id', query.sortOrder)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }

  countForExport(userId: string, filters: TransactionFilters): Promise<number> {
    return this.buildFilteredQuery(userId, filters).getCount();
  }

  async *iterateForExport(
    userId: string,
    filters: TransactionFilters,
    batchSize = 1000,
  ): AsyncGenerator<TransactionExportRow[]> {
    for (let offset = 0; ; offset += batchSize) {
      const rows = await this.buildFilteredQuery(userId, filters)
        .leftJoin('t.account', 'a')
        .leftJoin('t.category', 'c')
        .leftJoin('t.paymentMethod', 'pm')
        .select([])
        .addSelect(`to_char(t.date, 'YYYY-MM-DD')`, 'date')
        .addSelect('t.type', 'type')
        .addSelect('t.amount', 'amount')
        .addSelect('t.currency', 'currency')
        .addSelect('t.description', 'description')
        .addSelect('a.name', 'accountName')
        .addSelect('c.name', 'categoryName')
        .addSelect('pm.name', 'paymentMethodName')
        .orderBy('t.date', 'ASC')
        .addOrderBy('t.createdAt', 'ASC')
        .addOrderBy('t.id', 'ASC')
        .offset(offset)
        .limit(batchSize)
        .getRawMany<TransactionExportRow>();
      if (rows.length > 0) yield rows;
      if (rows.length < batchSize) return;
    }
  }

  /** Transaction count per month ("YYYY-MM"), newest first. */
  async countByMonth(
    userId: string,
    accountId?: string,
  ): Promise<{ month: string; count: number }[]> {
    const qb = this.transactionsRepository
      .createQueryBuilder('t')
      .select(`to_char(t.date, 'YYYY-MM')`, 'month')
      .addSelect('COUNT(*)', 'count')
      .where('t.userId = :userId', { userId });
    if (accountId) qb.andWhere('t.accountId = :accountId', { accountId });
    const rows = await qb
      .groupBy('month')
      .orderBy('month', 'DESC')
      .getRawMany<{ month: string; count: string }>();
    return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
  }

  private buildFilteredQuery(userId: string, query: TransactionFilters) {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
    if (
      query.minAmount !== undefined &&
      query.maxAmount !== undefined &&
      query.minAmount > query.maxAmount
    ) {
      throw new BadRequestException('minAmount must be less than or equal to maxAmount');
    }

    const qb = this.transactionsRepository
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId });

    if (query.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query.accountId) {
      qb.andWhere('t.accountId = :accountId', { accountId: query.accountId });
    }
    if (query.categoryId) {
      qb.andWhere('t.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.paymentMethodId) {
      qb.andWhere('t.paymentMethodId = :paymentMethodId', {
        paymentMethodId: query.paymentMethodId,
      });
    }
    if (query.source) qb.andWhere('t.source = :source', { source: query.source });
    if (query.importId) {
      qb.andWhere('t.importId = :importId', { importId: query.importId });
    }
    if (query.dateFrom) {
      qb.andWhere('t.date >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) qb.andWhere('t.date <= :dateTo', { dateTo: query.dateTo });
    if (query.minAmount !== undefined) {
      qb.andWhere('t.amount >= :minAmount', { minAmount: query.minAmount });
    }
    if (query.maxAmount !== undefined) {
      qb.andWhere('t.amount <= :maxAmount', { maxAmount: query.maxAmount });
    }
    if (query.search) {
      qb.andWhere('t.description ILIKE :search', {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    return qb;
  }

  async findOwned(userId: string, id: string) {
    const transaction = await this.transactionsRepository.findOne({
      where: { id, userId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const transaction = await this.findOwned(userId, id);

    const nextType = dto.type ?? transaction.type;
    const nextCategoryId =
      dto.categoryId === undefined ? transaction.categoryId : dto.categoryId;
    const categoryChanged = nextCategoryId !== transaction.categoryId;
    const typeChanged = nextType !== transaction.type;

    if (dto.accountId !== undefined && dto.accountId !== transaction.accountId) {
      const account = await this.getActiveAccount(userId, dto.accountId);
      transaction.accountId = account.id;
      transaction.currency = account.currency;
    }

    // Re-check the category when it changes, or when the type changes under it.
    // An already-linked category may stay even if it was archived later.
    if (nextCategoryId && (categoryChanged || typeChanged)) {
      await this.assertCategoryUsable(
        userId,
        nextCategoryId,
        nextType,
        categoryChanged,
      );
    }

    if (
      dto.paymentMethodId !== undefined &&
      dto.paymentMethodId !== transaction.paymentMethodId &&
      dto.paymentMethodId !== null
    ) {
      await this.assertPaymentMethodUsable(userId, dto.paymentMethodId);
    }

    transaction.type = nextType;
    transaction.categoryId = nextCategoryId ?? null;
    if (dto.paymentMethodId !== undefined) {
      transaction.paymentMethodId = dto.paymentMethodId;
    }
    if (dto.amount !== undefined) transaction.amount = dto.amount.toFixed(2);
    if (dto.date !== undefined) transaction.date = dto.date;
    if (dto.description !== undefined) {
      transaction.description = this.normalizeDescription(dto.description);
    }

    const updated = await this.transactionsRepository.save(transaction);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'transaction.updated',
      resourceType: 'transaction',
      resourceId: id,
    });
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const transaction = await this.findOwned(userId, id);
    await this.transactionsRepository.remove(transaction);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'transaction.deleted',
      resourceType: 'transaction',
      resourceId: id,
      metadata: {
        accountId: transaction.accountId,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        date: transaction.date,
      },
    });
  }

  async createMany(
    userId: string,
    accountId: string,
    items: ImportedTransactionInput[],
    options: { importId: string; manager?: EntityManager },
  ): Promise<Transaction[]> {
    if (items.length === 0) return [];

    const account = await this.getActiveAccount(userId, accountId);
    const categories = await this.loadOwned(items, 'categoryId', (id) =>
      this.categoriesService.findOwned(userId, id),
    );
    const paymentMethods = await this.loadOwned(items, 'paymentMethodId', (id) =>
      this.paymentMethodsService.findOwned(userId, id),
    );

    const entities = items.map((item, index) => {
      const row = item.rowNumber ?? index + 1;
      const fail = (message: string): never => {
        throw new BadRequestException(`Row ${row}: ${message}`);
      };

      if (!DATE_ONLY_PATTERN.test(item.date)) fail('date must be YYYY-MM-DD');
      const amount = this.parsePositiveAmount(item.amount) ?? fail('invalid amount');

      if (item.categoryId) {
        const category = categories.get(item.categoryId)!;
        if (category.isArchived) fail('category is archived');
        if (String(category.type) !== String(item.type)) {
          fail(`category type (${category.type}) does not match ${item.type}`);
        }
      }
      if (item.paymentMethodId) {
        const paymentMethod = paymentMethods.get(item.paymentMethodId)!;
        if (paymentMethod.isArchived) fail('payment method is archived');
      }

      return this.transactionsRepository.create({
        userId,
        accountId: account.id,
        currency: account.currency,
        categoryId: item.categoryId ?? null,
        paymentMethodId: item.paymentMethodId ?? null,
        type: item.type,
        amount,
        date: item.date,
        description: this.normalizeDescription(item.description?.trim()),
        source: TransactionSource.IMPORT,
        importId: options.importId,
        externalRef: item.externalRef || null,
        rawDetails: item.rawDetails || null,
      });
    });

    const repository =
      options.manager?.getRepository(Transaction) ?? this.transactionsRepository;
    try {
      return await repository.save(entities, { chunk: 200 });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'One or more bank references were already imported for this account',
        );
      }
      throw err;
    }
  }

  /** Returns which of the given bank references already exist on the account (one query). */
  async findExistingRefs(
    userId: string,
    accountId: string,
    refs: string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(refs.filter(Boolean))];
    if (unique.length === 0) return new Set();
    const rows = await this.transactionsRepository.find({
      select: { externalRef: true },
      where: { userId, accountId, externalRef: In(unique) },
    });
    return new Set(rows.map((r) => r.externalRef as string));
  }

  /** Existing transactions in a date range, for duplicate checks on rows without a bank reference. */
  findForDuplicateCheck(
    userId: string,
    accountId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<DuplicateCheckCandidate[]> {
    return this.transactionsRepository.find({
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
        externalRef: true,
      },
      where: { userId, accountId, date: Between(dateFrom, dateTo) },
    });
  }

  /** Deletes every transaction created by an import ("undo import"). Returns the count. */
  async deleteByImport(
    userId: string,
    importId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repository =
      manager?.getRepository(Transaction) ?? this.transactionsRepository;
    const result = await repository.delete({ userId, importId });
    return result.affected ?? 0;
  }

  /** Loads each distinct referenced id once (404 if any is not owned). */
  private async loadOwned<T>(
    items: ImportedTransactionInput[],
    key: 'categoryId' | 'paymentMethodId',
    find: (id: string) => Promise<T>,
  ): Promise<Map<string, T>> {
    const ids = [...new Set(items.map((i) => i[key]).filter(Boolean))] as string[];
    const entries = await Promise.all(
      ids.map(async (id) => [id, await find(id)] as const),
    );
    return new Map(entries);
  }

  /** Normalizes "7" / "7.5" / "7.00" to "7.00"; null if not a positive amount with ≤ 2 decimals. */
  private parsePositiveAmount(value: string): string | null {
    const trimmed = value?.trim();
    if (!trimmed || !AMOUNT_PATTERN.test(trimmed)) return null;
    const amount = new Decimal(trimmed);
    return amount.gt(0) ? amount.toFixed(2) : null;
  }

  private async getActiveAccount(userId: string, accountId: string): Promise<Account> {
    const account = await this.accountsService.findOwned(userId, accountId);
    if (account.isArchived) {
      throw new BadRequestException('Account is archived');
    }
    return account;
  }

  private async assertCategoryUsable(
    userId: string,
    categoryId: string,
    type: TransactionType,
    rejectArchived: boolean,
  ) {
    const category = await this.categoriesService.findOwned(userId, categoryId);
    if (rejectArchived && category.isArchived) {
      throw new BadRequestException('Category is archived');
    }
    if (String(category.type) !== String(type)) {
      throw new BadRequestException(
        `Category type (${category.type}) does not match transaction type (${type})`,
      );
    }
  }

  private async assertPaymentMethodUsable(userId: string, paymentMethodId: string) {
    const paymentMethod = await this.paymentMethodsService.findOwned(
      userId,
      paymentMethodId,
    );
    if (paymentMethod.isArchived) {
      throw new BadRequestException('Payment method is archived');
    }
  }

  private normalizeDescription(description?: string | null) {
    return description ? description : null;
  }
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, '\\$&');
}
