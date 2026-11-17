import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { ReportsModule } from '../reports/reports.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [BudgetsModule, ReportsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
