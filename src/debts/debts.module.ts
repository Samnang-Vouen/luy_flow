import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { DebtPayment } from './entities/debt-payment.entity';
import { Debt } from './entities/debt.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Debt, DebtPayment]),
    AuditLogsModule,
    NotificationsModule,
  ],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
