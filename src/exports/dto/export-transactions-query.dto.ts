import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { ListTransactionsQueryDto } from '../../transactions/dto/list-transactions-query.dto';

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Same filters as GET /transactions (no paging/sorting), plus:
 * - month: export one calendar month, e.g. 2026-01 for January 2026
 *   (or use dateFrom/dateTo for a custom range, not both)
 * - format: csv or xlsx
 */
export class ExportTransactionsQueryDto extends OmitType(ListTransactionsQueryDto, [
  'page',
  'limit',
  'sortBy',
  'sortOrder',
] as const) {
  @ApiPropertyOptional({
    example: '2026-01',
    description: 'One calendar month (YYYY-MM). Cannot be combined with dateFrom/dateTo.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month must be in YYYY-MM format, e.g. 2026-01' })
  month?: string;

  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'csv' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format: ExportFormat = 'csv';
}

export class ListExportMonthsQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional: only count transactions in this account (an id from GET /accounts). Leave empty for all accounts.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
