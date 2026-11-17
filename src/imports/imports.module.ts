import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CategoriesModule } from '../categories/categories.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategorizationRulesService } from './categorization-rules/categorization-rules.service';
import { CategorizationRule } from './categorization-rules/entities/categorization-rule.entity';
import { ImportRow } from './entities/import-row.entity';
import { Import } from './entities/import.entity';
import { ImportProfile } from './import-profiles/entities/import-profile.entity';
import { ImportProfilesController } from './import-profiles/import-profiles.controller';
import { ImportProfilesService } from './import-profiles/import-profiles.service';
import { ImportsController } from './imports.controller';
import { ImportsProcessor } from './imports.processor';
import { IMPORTS_QUEUE } from './imports.queue';
import { ImportsService } from './imports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Import,
      ImportRow,
      ImportProfile,
      CategorizationRule,
    ]),
    BullModule.registerQueue({ name: IMPORTS_QUEUE }),
    AccountsModule,
    CategoriesModule,
    PaymentMethodsModule,
    TransactionsModule,
    AuditLogsModule,
  ],
  controllers: [ImportsController, ImportProfilesController],
  providers: [
    ImportsService,
    ImportsProcessor,
    ImportProfilesService,
    CategorizationRulesService,
  ],
})
export class ImportsModule {}
