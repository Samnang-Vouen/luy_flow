import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [TransactionsModule, AuditLogsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
