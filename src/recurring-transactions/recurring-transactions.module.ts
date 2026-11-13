import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { RecurringTransactionsController } from './recurring-transactions.controller';
import { RecurringTransactionsService } from './recurring-transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([RecurringTransaction]), AuditLogsModule],
  controllers: [RecurringTransactionsController],
  providers: [RecurringTransactionsService],
})
export class RecurringTransactionsModule {}
