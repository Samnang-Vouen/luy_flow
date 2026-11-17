import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsISO4217CurrencyCode,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Currencies are never combined or converted.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currency?: string;

  @ApiPropertyOptional({
    enum: ['day', 'week', 'month', 'year'],
    default: 'month',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  groupBy: 'day' | 'week' | 'month' | 'year' = 'month';
}
