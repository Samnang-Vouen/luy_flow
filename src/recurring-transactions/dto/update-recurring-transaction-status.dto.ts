import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RecurringTransactionStatus } from '../entities/recurring-transaction.entity';

export class UpdateRecurringTransactionStatusDto {
  @ApiProperty({ enum: RecurringTransactionStatus })
  @IsEnum(RecurringTransactionStatus)
  status: RecurringTransactionStatus;
}
