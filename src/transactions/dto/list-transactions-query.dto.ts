import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  TransactionSource,
  TransactionType,
} from '../entities/transaction.entity';
import { DATE_ONLY_PATTERN } from './create-transaction.dto';

export enum TransactionSortBy {
  DATE = 'date',
  AMOUNT = 'amount',
  CREATED_AT = 'createdAt',
}

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ enum: TransactionSource })
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;

  @ApiPropertyOptional({ description: 'Only transactions created by this import' })
  @IsOptional()
  @IsUUID()
  importId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Inclusive, YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'dateFrom must be in YYYY-MM-DD format' })
  @IsDateString({ strict: true })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Inclusive, YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'dateTo must be in YYYY-MM-DD format' })
  @IsDateString({ strict: true })
  dateTo?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ description: 'Case-insensitive match on description' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: TransactionSortBy, default: TransactionSortBy.DATE })
  @IsOptional()
  @IsEnum(TransactionSortBy)
  sortBy: TransactionSortBy = TransactionSortBy.DATE;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}
