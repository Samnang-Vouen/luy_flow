import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CategoriesService } from '../categories/categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CategorizationRulesService } from './categorization-rules/categorization-rules.service';
import {
  CreateImportDto,
  UploadedStatementFile,
} from './dto/create-import.dto';
import { UpdateImportRowDto } from './dto/update-import-row.dto';
import {
  DuplicateKind,
  ImportRow,
  ImportRowStatus,
} from './entities/import-row.entity';
import { Import, ImportStatus } from './entities/import.entity';
import { ImportProfilesService } from './import-profiles/import-profiles.service';
import {
  IMPORTS_QUEUE,
  IMPORT_JOB_OPTIONS,
  ImportJob,
  ImportJobData,
} from './imports.queue';
import {
  StatementFileError,
  detectStatementFileType,
  readStatementRows,
} from './parsers/statement-file.parser';
import {
  DraftRow,
  checkBalances,
  extractRows,
  markDuplicates,
} from './statement-analyzer';

export const MAX_STATEMENT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_STATEMENT_ROWS = 5000;

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(Import)
    private readonly importsRepository: Repository<Import>,
    @InjectRepository(ImportRow)
    private readonly rowsRepository: Repository<ImportRow>,
    @InjectQueue(IMPORTS_QUEUE)
    private readonly importsQueue: Queue<ImportJobData>,
    private readonly dataSource: DataSource,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly transactionsService: TransactionsService,
    private readonly profilesService: ImportProfilesService,
    private readonly rulesService: CategorizationRulesService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // API side: quick checks, store, enqueue, return immediately.
  // ---------------------------------------------------------------------------

  /** Stores the file and queues the preview job. Returns the import with status "processing". */
  async upload(
    userId: string,
    file: UploadedStatementFile | undefined,
    dto: CreateImportDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload a statement file in the "file" field');
    }
    let fileType: string;
    try {
      fileType = detectStatementFileType(file.buffer, file.originalname);
    } catch (err) {
      throw toHttpError(err);
    }
    const account = await this.accountsService.findOwned(userId, dto.accountId);
    if (account.isArchived) {
      throw new BadRequestException('Account is archived');
    }
    const profile = await this.profilesService.findOwned(userId, dto.profileId);

    const created = await this.importsRepository.save(
      this.importsRepository.create({
        userId,
        accountId: account.id,
        profileId: profile.id,
        fileName: file.originalname.slice(0, 255),
        fileType,
        fileHash: createHash('sha256').update(file.buffer).digest('hex'),
        fileContent: file.buffer,
        status: ImportStatus.PROCESSING,
      }),
    );

    try {
      await this.importsQueue.add(
        ImportJob.PREVIEW,
        { importId: created.id },
        { ...IMPORT_JOB_OPTIONS, jobId: `preview-${created.id}` },
      );
    } catch {
      await this.importsRepository.update(created.id, {
        status: ImportStatus.FAILED,
        error: 'Could not queue the import. Please try again.',
        fileContent: null,
      });
      throw new ServiceUnavailableException(
        'Import queue is unavailable. Please try again.',
      );
    }

    await this.audit(userId, 'import.created', created.id, {
      accountId: account.id,
    });
    return this.findOwned(userId, created.id);
  }

  findAllByUser(userId: string) {
    return this.importsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findOwned(userId: string, id: string) {
    const found = await this.importsRepository.findOne({ where: { id, userId } });
    if (!found) {
      throw new NotFoundException('Import not found');
    }
    return found;
  }

  async findRows(userId: string, id: string, status?: ImportRowStatus) {
    await this.findOwned(userId, id);
    return this.rowsRepository.find({
      where: status ? { importId: id, status } : { importId: id },
      order: { rowNumber: 'ASC' },
    });
  }

  /** Edits a preview row: include/exclude it, or fix its category, payment method or description. */
  async updateRow(
    userId: string,
    importId: string,
    rowId: string,
    dto: UpdateImportRowDto,
  ) {
    const found = await this.findOwned(userId, importId);
    assertStatus(found, ImportStatus.PREVIEW);
    const row = await this.rowsRepository.findOne({
      where: { id: rowId, importId },
    });
    if (!row) {
      throw new NotFoundException('Import row not found');
    }

    if (dto.selected === true) {
      if (row.status === ImportRowStatus.INVALID) {
        throw new BadRequestException('Invalid rows cannot be imported');
      }
      if (row.duplicateKind === DuplicateKind.REFERENCE) {
        throw new BadRequestException('This bank reference was already imported');
      }
    }
    if (dto.selected !== undefined) row.selected = dto.selected;

    if (dto.categoryId !== undefined) {
      if (dto.categoryId) {
        const category = await this.categoriesService.findOwned(userId, dto.categoryId);
        if (category.isArchived) {
          throw new BadRequestException('Category is archived');
        }
        if (row.type && String(category.type) !== String(row.type)) {
          throw new BadRequestException(
            `Category type (${category.type}) does not match the row type (${row.type})`,
          );
        }
      }
      row.categoryId = dto.categoryId;
    }

    if (dto.paymentMethodId !== undefined) {
      if (dto.paymentMethodId) {
        const paymentMethod = await this.paymentMethodsService.findOwned(
          userId,
          dto.paymentMethodId,
        );
        if (paymentMethod.isArchived) {
          throw new BadRequestException('Payment method is archived');
        }
      }
      row.paymentMethodId = dto.paymentMethodId;
    }

    if (dto.description !== undefined) {
      row.description = dto.description || null;
    }

    return this.rowsRepository.save(row);
  }

  /** Marks the import "confirming" and queues the confirm job. */
  async requestConfirm(userId: string, importId: string) {
    await this.dataSource.transaction(async (manager) => {
      const found = await this.lockImport(manager, importId, userId);
      assertStatus(found, ImportStatus.PREVIEW);
      const selected = await manager.getRepository(ImportRow).count({
        where: {
          importId,
          selected: true,
          status: Not(ImportRowStatus.INVALID),
        },
      });
      if (selected === 0) {
        throw new BadRequestException('No rows are selected for import');
      }
      await manager
        .getRepository(Import)
        .update(importId, { status: ImportStatus.CONFIRMING, error: null });
    });

    try {
      // No fixed jobId: a confirm may be retried after a failed one.
      await this.importsQueue.add(
        ImportJob.CONFIRM,
        { importId },
        IMPORT_JOB_OPTIONS,
      );
    } catch {
      await this.importsRepository.update(
        { id: importId, status: ImportStatus.CONFIRMING },
        { status: ImportStatus.PREVIEW },
      );
      throw new ServiceUnavailableException(
        'Import queue is unavailable. Please try again.',
      );
    }
    return this.findOwned(userId, importId);
  }

  /**
   * processing / failed / preview -> cancelled (staged data is discarded).
   * confirmed -> undone (every transaction created by this import is deleted,
   * including any edits made to them since).
   */
  async remove(userId: string, importId: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const found = await this.lockImport(manager, importId, userId);
      const imports = manager.getRepository(Import);

      if (
        found.status === ImportStatus.PROCESSING ||
        found.status === ImportStatus.FAILED ||
        found.status === ImportStatus.PREVIEW
      ) {
        await manager.getRepository(ImportRow).delete({ importId });
        await imports.update(importId, {
          status: ImportStatus.CANCELLED,
          fileContent: null,
        });
        return { status: ImportStatus.CANCELLED, deletedTransactions: 0 };
      }
      if (found.status === ImportStatus.CONFIRMED) {
        const deleted = await this.transactionsService.deleteByImport(
          userId,
          importId,
          manager,
        );
        await imports.update(importId, { status: ImportStatus.UNDONE });
        return { status: ImportStatus.UNDONE, deletedTransactions: deleted };
      }
      if (found.status === ImportStatus.CONFIRMING) {
        throw new ConflictException(
          'The import is being confirmed. Try again when it has finished.',
        );
      }
      throw new BadRequestException(`Import is already ${found.status}`);
    });

    await this.audit(
      userId,
      result.status === ImportStatus.UNDONE ? 'import.undone' : 'import.cancelled',
      importId,
      { deletedTransactions: result.deletedTransactions },
    );
    return result;
  }

  // ---------------------------------------------------------------------------
  // Worker side: called by ImportsProcessor. Safe to retry: each step checks
  // the status first and does nothing if the import has moved on.
  // ---------------------------------------------------------------------------

  /** Parses the stored file and replaces the import's preview rows. */
  async buildPreview(importId: string): Promise<void> {
    const found = await this.importsRepository
      .createQueryBuilder('i')
      .addSelect('i.fileContent')
      .where('i.id = :importId', { importId })
      .getOne();
    if (!found || found.status !== ImportStatus.PROCESSING) return;
    if (!found.fileContent) {
      throw new BadRequestException('The uploaded file is no longer available');
    }

    const { userId } = found;
    const account = await this.accountsService.findOwned(userId, found.accountId);
    if (account.isArchived) {
      throw new BadRequestException('Account is archived');
    }
    if (!found.profileId) {
      throw new BadRequestException('The import profile was deleted');
    }
    const profile = await this.profilesService.findOwned(userId, found.profileId);

    let parsed: Awaited<ReturnType<typeof readStatementRows>>;
    try {
      parsed = await readStatementRows(found.fileContent, found.fileName);
    } catch (err) {
      throw toHttpError(err);
    }

    // Load lookup data once per import, not once per row.
    const [categories, paymentMethods, rules] = await Promise.all([
      this.categoriesService.findAllByUser(userId),
      this.paymentMethodsService.findAllByUser(userId),
      this.rulesService.loadForUser(userId),
    ]);
    const drafts = extractRows(parsed.rows, {
      accountCurrency: account.currency,
      profile,
      categoryTypes: new Map(categories.map((c) => [c.id, String(c.type)])),
      paymentMethodIds: new Set(paymentMethods.map((p) => p.id)),
      rules,
    });
    if (drafts.length === 0) {
      throw new BadRequestException(
        "No transaction rows found. Check the profile's headerRows and column mapping.",
      );
    }
    if (drafts.length > MAX_STATEMENT_ROWS) {
      throw new BadRequestException(
        `The statement has ${drafts.length} rows; the maximum is ${MAX_STATEMENT_ROWS}. Split it into smaller files.`,
      );
    }

    const validDates = drafts
      .filter((d) => d.errors.length === 0)
      .map((d) => d.date as string)
      .sort();
    const [existingRefs, candidates] = await Promise.all([
      this.transactionsService.findExistingRefs(
        userId,
        account.id,
        drafts.map((d) => d.externalRef).filter((r): r is string => !!r),
      ),
      validDates.length > 0
        ? this.transactionsService.findForDuplicateCheck(
            userId,
            account.id,
            validDates[0],
            validDates[validDates.length - 1],
          )
        : Promise.resolve([]),
    ]);
    markDuplicates(drafts, existingRefs, candidates);
    const balances = checkBalances(drafts);

    const warnings: string[] = [];
    const sameFile = await this.importsRepository.findOne({
      where: {
        userId,
        accountId: account.id,
        fileHash: found.fileHash,
        status: ImportStatus.CONFIRMED,
      },
      order: { confirmedAt: 'DESC' },
    });
    if (sameFile) {
      warnings.push(
        `This file was already imported on ${sameFile.confirmedAt?.toISOString().slice(0, 10)}`,
      );
    }

    const statuses = drafts.map(statusOf);
    const count = (status: ImportRowStatus) =>
      statuses.filter((s) => s === status).length;

    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockImport(manager, importId);
      if (current.status !== ImportStatus.PROCESSING) return; // cancelled meanwhile

      const rows = manager.getRepository(ImportRow);
      await rows.delete({ importId }); // a retried job starts clean
      await rows.save(
        drafts.map((draft, i) =>
          rows.create({
            ...draft,
            importId,
            status: statuses[i],
            selected: statuses[i] === ImportRowStatus.VALID,
          }),
        ),
        { chunk: 500 },
      );
      await manager.getRepository(Import).update(importId, {
        fileType: parsed.type,
        status: ImportStatus.PREVIEW,
        error: null,
        fileContent: null,
        totalRows: drafts.length,
        validRows: count(ImportRowStatus.VALID),
        invalidRows: count(ImportRowStatus.INVALID),
        duplicateRows: count(ImportRowStatus.DUPLICATE),
        statementOpeningBalance: balances.opening,
        statementClosingBalance: balances.closing,
        warnings,
      });
    });
  }

  /**
   * Creates transactions for the selected rows, all-or-nothing, and learns
   * counterparty -> category rules from the user's choices.
   */
  async applyConfirm(importId: string): Promise<void> {
    const confirmed = await this.dataSource.transaction(async (manager) => {
      const found = await this.lockImport(manager, importId);
      if (found.status !== ImportStatus.CONFIRMING) return null;
      const { userId } = found;

      const rows = await manager.getRepository(ImportRow).find({
        where: { importId, selected: true },
        order: { rowNumber: 'ASC' },
      });
      const importable = rows.filter(
        (r) =>
          r.status !== ImportRowStatus.INVALID &&
          r.duplicateKind !== DuplicateKind.REFERENCE,
      );
      if (importable.length === 0) {
        throw new BadRequestException('No rows are selected for import');
      }

      const created = await this.transactionsService.createMany(
        userId,
        found.accountId,
        importable.map((r) => ({
          rowNumber: r.rowNumber,
          type: r.type!,
          amount: r.amount!,
          date: r.date!,
          description: r.description,
          categoryId: r.categoryId,
          paymentMethodId: r.paymentMethodId,
          externalRef: r.externalRef,
          rawDetails: r.rawDetails,
        })),
        { importId, manager },
      );
      importable.forEach((row, i) => (row.transactionId = created[i].id));
      await manager.getRepository(ImportRow).save(importable, { chunk: 500 });

      await this.rulesService.learn(
        manager,
        userId,
        importable
          .filter((r) => r.counterparty && r.categoryId && r.type)
          .map((r) => ({
            type: r.type!,
            counterparty: r.counterparty!,
            categoryId: r.categoryId!,
          })),
      );

      await manager.getRepository(Import).update(importId, {
        status: ImportStatus.CONFIRMED,
        error: null,
        importedRows: created.length,
        confirmedAt: new Date(),
      });
      return { userId, accountId: found.accountId, importedRows: created.length };
    });

    if (confirmed) {
      await this.audit(confirmed.userId, 'import.confirmed', importId, {
        accountId: confirmed.accountId,
        importedRows: confirmed.importedRows,
      });
    }
  }

  /**
   * Called once a job has failed for good. A failed preview ends the import;
   * a failed confirm returns it to preview so the user can fix rows and retry.
   */
  async markJobFailed(job: ImportJob, importId: string, message: string) {
    if (job === ImportJob.PREVIEW) {
      await this.importsRepository.update(
        { id: importId, status: ImportStatus.PROCESSING },
        { status: ImportStatus.FAILED, error: message, fileContent: null },
      );
    } else {
      await this.importsRepository.update(
        { id: importId, status: ImportStatus.CONFIRMING },
        { status: ImportStatus.PREVIEW, error: `Confirm failed: ${message}` },
      );
    }
  }

  /** Row lock so the API and the worker never change the same import at once. */
  private async lockImport(
    manager: EntityManager,
    id: string,
    userId?: string,
  ) {
    const found = await manager.getRepository(Import).findOne({
      where: userId ? { id, userId } : { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!found) {
      throw new NotFoundException('Import not found');
    }
    return found;
  }

  private audit(
    userId: string,
    action: string,
    importId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.auditLogsService.record({
      actorUserId: userId,
      action,
      resourceType: 'import',
      resourceId: importId,
      metadata,
    });
  }
}

function statusOf(draft: DraftRow): ImportRowStatus {
  if (draft.errors.length > 0) return ImportRowStatus.INVALID;
  if (draft.duplicateKind) return ImportRowStatus.DUPLICATE;
  return ImportRowStatus.VALID;
}

function assertStatus(found: Import, expected: ImportStatus) {
  if (found.status !== expected) {
    throw new BadRequestException(
      `Import is ${found.status}; this action needs it to be ${expected}`,
    );
  }
}

function toHttpError(err: unknown) {
  return err instanceof StatementFileError
    ? new BadRequestException(err.message)
    : err;
}
