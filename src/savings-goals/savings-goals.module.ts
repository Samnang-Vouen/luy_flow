import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SavingsGoalContribution } from './entities/savings-goal-contribution.entity';
import { SavingsGoal } from './entities/savings-goal.entity';
import { SavingsGoalsController } from './savings-goals.controller';
import { SavingsGoalsService } from './savings-goals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingsGoal, SavingsGoalContribution]),
    AuditLogsModule,
    NotificationsModule,
    IdempotencyModule,
  ],
  controllers: [SavingsGoalsController],
  providers: [SavingsGoalsService],
})
export class SavingsGoalsModule {}
