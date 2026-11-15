import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { AdminModule } from './admin/admin.module';
import databaseConfig from './config/database.config';
import { RecurringTransactionsModule } from './recurring-transactions/recurring-transactions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../.env'),
      load: [databaseConfig],
      cache: true,
    }),
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
    AuthModule,
    UsersModule,
    SessionsModule,
    AdminModule,
    AccountsModule,
    CategoriesModule,
    PaymentMethodsModule,
    TransactionsModule,
    RecurringTransactionsModule,
    NotificationsModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
