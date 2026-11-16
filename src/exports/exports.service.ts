import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { stringify } from 'csv-stringify';
import { Readable, pipeline } from 'stream';
import writeXlsxFile, { type Row } from 'write-excel-file/node';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TransactionType } from '../transactions/entities/transaction.entity';
import {
  TransactionExportRow,
  TransactionFilters,
  TransactionsService,
} from '../transactions/transactions.service';
import {
  ExportFormat,
  ExportTransactionsQueryDto,
} from './dto/export-transactions-query.dto';

export const MAX_EXPORT_ROWS = 50_000;

const COLUMNS = [
  { header: 'No.', width: 6 },
  { header: 'Date', width: 12 },
  { header: 'Type', width: 10 },
  { header: 'Category', width: 18 },
  { header: 'Account', width: 18 },
  { header: 'Payment method', width: 16 },
  { header: 'Amount', width: 12 },
  { header: 'Currency', width: 9 },
  { header: 'Description', width: 45 },
];

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export interface ExportFile {
  content: Readable | Buffer;
  contentType: string;
  fileName: string;
  rows: number;
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /** Months that have transactions, newest first, e.g. for a "January 2026" dropdown. */
  async listMonths(userId: string, accountId?: string) {
    const months = await this.transactionsService.countByMonth(userId, accountId);
    return months.map(({ month, count }) => ({
      month,
      label: monthLabel(month),
      count,
    }));
  }

  async exportTransactions(
    userId: string,
    query: ExportTransactionsQueryDto,
  ): Promise<ExportFile> {
    const { format, month, ...rest } = query;
    if (month && (rest.dateFrom || rest.dateTo)) {
      throw new BadRequestException('Use either month or dateFrom/dateTo, not both');
    }
    const filters: TransactionFilters = month
      ? { ...rest, ...monthRange(month) }
      : rest;

    const rows = await this.transactionsService.countForExport(userId, filters);
    if (rows > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `This export has ${rows} transactions; the maximum is ${MAX_EXPORT_ROWS}. Narrow the date range or filters.`,
      );
    }

    const file: ExportFile = {
      content:
        format === 'xlsx'
          ? await this.toXlsx(userId, filters)
          : this.toCsv(userId, filters),
      contentType: CONTENT_TYPES[format],
      fileName: fileNameFor(filters, format, month),
      rows,
    };

    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'export.created',
      resourceType: 'export',
      metadata: { kind: 'transactions', format, rows, month, filters },
    });
    return file;
  }

  private toCsv(userId: string, filters: TransactionFilters): Readable {
    const transactions = this.transactionsService;
    async function* records() {
      yield COLUMNS.map((c) => c.header);
      let no = 0;
      for await (const batch of transactions.iterateForExport(userId, filters)) {
        for (const t of batch) {
          no += 1;
          yield [
            String(no),
            t.date,
            typeLabel(t.type),
            csvText(t.categoryName),
            csvText(t.accountName),
            csvText(t.paymentMethodName),
            t.amount,
            t.currency,
            csvText(t.description),
          ];
        }
      }
    }

    // BOM so Excel opens UTF-8 correctly (e.g. Khmer names).
    const csv = stringify({ bom: true });
    pipeline(Readable.from(records()), csv, (err) => {
      if (err) this.logger.warn(`CSV export failed: ${err.message}`);
    });
    return csv;
  }

  private async toXlsx(userId: string, filters: TransactionFilters): Promise<Buffer> {
    const header: Row = COLUMNS.map((c) => ({ value: c.header, fontWeight: 'bold' }));
    const data: Row[] = [header];
    let no = 0;
    for await (const batch of this.transactionsService.iterateForExport(userId, filters)) {
      for (const t of batch) {
        no += 1;
        data.push(xlsxRow(no, t));
      }
    }
    return writeXlsxFile(data, {
      sheet: 'Transactions',
      columns: COLUMNS.map((c) => ({ width: c.width })),
      stickyRowsCount: 1,
    }).toBuffer();
  }
}

function xlsxRow(no: number, t: TransactionExportRow): Row {
  return [
    { value: no, type: Number },
    { value: t.date, type: String },
    { value: typeLabel(t.type), type: String },
    t.categoryName ?? null,
    t.accountName,
    t.paymentMethodName ?? null,
    // A number cell so SUM works; 2-decimal values are exact enough as doubles.
    { value: Number(t.amount), type: Number, format: '#,##0.00' },
    t.currency,
    t.description ?? null,
  ];
}

function typeLabel(type: TransactionType) {
  return type === TransactionType.INCOME ? 'Income' : 'Expense';
}

function csvText(value: string | null): string {
  if (!value) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** "2026-01" -> first and last day of January 2026. */
function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** "2026-01" -> "January 2026" */
function monthLabel(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fileNameFor(filters: TransactionFilters, format: ExportFormat, month?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const range = month
    ? month
    : filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom ?? 'start'}_${filters.dateTo ?? today}`
      : today;
  return `transactions_${range}.${format}`;
}
