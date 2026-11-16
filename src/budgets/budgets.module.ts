import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CategoriesModule } from '../categories/categories.module';
import { Transaction } from '../transactions/entities/transaction.entity';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { Budget } from './entities/budget.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Budget, Transaction]),
    CategoriesModule,
    AuditLogsModule,
  ],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
