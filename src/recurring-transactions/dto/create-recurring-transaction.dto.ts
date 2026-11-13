import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RecurrenceFrequency,
  RecurringTransactionType,
} from '../entities/recurring-transaction.entity';

export class CreateRecurringTransactionDto {
  @ApiProperty()
  @IsUUID()
  accountId: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  description: string;

  @ApiProperty({ example: 25.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: RecurringTransactionType })
  @IsEnum(RecurringTransactionType)
  type: RecurringTransactionType;

  @ApiProperty({ enum: RecurrenceFrequency })
  @IsEnum(RecurrenceFrequency)
  frequency: RecurrenceFrequency;

  @ApiProperty({ example: '2026-12-01' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2027-12-01', nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}
