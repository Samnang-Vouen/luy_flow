import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TransactionType } from '../entities/transaction.entity';

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTransactionDto {
  @ApiProperty()
  @IsUUID()
  accountId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string | null;

  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 12.5, description: 'Always positive; direction comes from type' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-11-15', description: 'YYYY-MM-DD' })
  @Matches(DATE_ONLY_PATTERN, { message: 'date must be in YYYY-MM-DD format' })
  @IsDateString({ strict: true })
  date: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true, example: 'Lunch' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
