import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { AdminModule } from './admin/admin.module';
import databaseConfig from './config/database.config';
import { RecurringTransactionsModule } from './recurring-transactions/recurring-transactions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SavingsGoalsModule } from './savings-goals/savings-goals.module';
import { DebtsModule } from './debts/debts.module';
import { GroupsModule } from './groups/groups.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ImportsModule } from './imports/imports.module';
import { ExportsModule } from './exports/exports.module';
import { BudgetsModule } from './budgets/budgets.module';
import { ReportsModule } from './reports/reports.module';
import { RecommendationsModule } from './recommendations/recommendations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Loads .env from the working directory (the repo root for all npm scripts).
      // Not resolved from __dirname: that doesn't exist when Jest runs the app as ES modules.
      load: [databaseConfig],
      cache: true,
    }),
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
    // Shared Redis connection for all BullMQ queues; modules register their own queues.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(config.get('REDIS_PORT') ?? 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    AuthModule,
    UsersModule,
    SessionsModule,
    AdminModule,
    AccountsModule,
    CategoriesModule,
    PaymentMethodsModule,
    TransactionsModule,
    ImportsModule,
    ExportsModule,
    RecurringTransactionsModule,
    NotificationsModule,
    AuditLogsModule,
    SavingsGoalsModule,
    DebtsModule,
    GroupsModule,
    BudgetsModule,
    ReportsModule,
    RecommendationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
