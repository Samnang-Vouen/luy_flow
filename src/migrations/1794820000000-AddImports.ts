import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImports1794820000000 implements MigrationInterface {
  name = 'AddImports1794820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // import_profiles
    await queryRunner.query(
      `CREATE TABLE "import_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(60) NOT NULL, "columns" jsonb NOT NULL, "dateFormat" character varying(40) NOT NULL DEFAULT 'MMM d, yyyy', "headerRows" integer NOT NULL DEFAULT 1, "channelPaymentMethods" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_import_profiles_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_import_profiles_userId_name" ON "import_profiles" ("userId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_profiles" ADD CONSTRAINT "FK_import_profiles_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // imports
    await queryRunner.query(
      `CREATE TYPE "public"."imports_status_enum" AS ENUM('processing', 'preview', 'confirming', 'confirmed', 'failed', 'cancelled', 'undone')`,
    );
    await queryRunner.query(
      `CREATE TABLE "imports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "accountId" uuid NOT NULL, "profileId" uuid, "fileName" character varying(255) NOT NULL, "fileType" character varying(10) NOT NULL, "fileHash" character(64) NOT NULL, "fileContent" bytea, "status" "public"."imports_status_enum" NOT NULL DEFAULT 'processing', "error" text, "totalRows" integer NOT NULL DEFAULT 0, "validRows" integer NOT NULL DEFAULT 0, "invalidRows" integer NOT NULL DEFAULT 0, "duplicateRows" integer NOT NULL DEFAULT 0, "importedRows" integer NOT NULL DEFAULT 0, "statementOpeningBalance" numeric(14,2), "statementClosingBalance" numeric(14,2), "warnings" jsonb NOT NULL DEFAULT '[]', "confirmedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_imports_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_imports_userId_createdAt" ON "imports" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_imports_accountId_fileHash" ON "imports" ("accountId", "fileHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "imports" ADD CONSTRAINT "FK_imports_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "imports" ADD CONSTRAINT "FK_imports_accountId" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "imports" ADD CONSTRAINT "FK_imports_profileId" FOREIGN KEY ("profileId") REFERENCES "import_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // import_rows
    await queryRunner.query(
      `CREATE TYPE "public"."import_rows_status_enum" AS ENUM('valid', 'invalid', 'duplicate')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."import_rows_type_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."import_rows_duplicate_kind_enum" AS ENUM('reference', 'fingerprint')`,
    );
    await queryRunner.query(
      `CREATE TABLE "import_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "importId" uuid NOT NULL, "rowNumber" integer NOT NULL, "cells" jsonb NOT NULL, "status" "public"."import_rows_status_enum" NOT NULL, "errors" jsonb NOT NULL DEFAULT '[]', "warnings" jsonb NOT NULL DEFAULT '[]', "selected" boolean NOT NULL DEFAULT false, "date" date, "type" "public"."import_rows_type_enum", "amount" numeric(14,2), "balance" numeric(14,2), "description" character varying(255), "counterparty" character varying(120), "channel" character varying(30), "externalRef" character varying(64), "rawDetails" text, "categoryId" uuid, "paymentMethodId" uuid, "duplicateKind" "public"."import_rows_duplicate_kind_enum", "duplicateOfTransactionId" uuid, "transactionId" uuid, CONSTRAINT "PK_import_rows_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_import_rows_importId_rowNumber" ON "import_rows" ("importId", "rowNumber")`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" ADD CONSTRAINT "FK_import_rows_importId" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" ADD CONSTRAINT "FK_import_rows_categoryId" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" ADD CONSTRAINT "FK_import_rows_paymentMethodId" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" ADD CONSTRAINT "FK_import_rows_transactionId" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // categorization_rules
    await queryRunner.query(
      `CREATE TYPE "public"."categorization_rules_type_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TABLE "categorization_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "type" "public"."categorization_rules_type_enum" NOT NULL, "counterparty" character varying(120) NOT NULL, "categoryId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_categorization_rules_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_categorization_rules_userId_type_counterparty" ON "categorization_rules" ("userId", "type", "counterparty")`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rules" ADD CONSTRAINT "FK_categorization_rules_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rules" ADD CONSTRAINT "FK_categorization_rules_categoryId" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // transactions.importId -> imports (column added in AddTransactionImportFields)
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_importId" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_importId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "categorization_rules" DROP CONSTRAINT "FK_categorization_rules_categoryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rules" DROP CONSTRAINT "FK_categorization_rules_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_categorization_rules_userId_type_counterparty"`,
    );
    await queryRunner.query(`DROP TABLE "categorization_rules"`);
    await queryRunner.query(`DROP TYPE "public"."categorization_rules_type_enum"`);

    await queryRunner.query(
      `ALTER TABLE "import_rows" DROP CONSTRAINT "FK_import_rows_transactionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" DROP CONSTRAINT "FK_import_rows_paymentMethodId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" DROP CONSTRAINT "FK_import_rows_categoryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_rows" DROP CONSTRAINT "FK_import_rows_importId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_import_rows_importId_rowNumber"`);
    await queryRunner.query(`DROP TABLE "import_rows"`);
    await queryRunner.query(`DROP TYPE "public"."import_rows_duplicate_kind_enum"`);
    await queryRunner.query(`DROP TYPE "public"."import_rows_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."import_rows_status_enum"`);

    await queryRunner.query(`ALTER TABLE "imports" DROP CONSTRAINT "FK_imports_profileId"`);
    await queryRunner.query(`ALTER TABLE "imports" DROP CONSTRAINT "FK_imports_accountId"`);
    await queryRunner.query(`ALTER TABLE "imports" DROP CONSTRAINT "FK_imports_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_imports_accountId_fileHash"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_imports_userId_createdAt"`);
    await queryRunner.query(`DROP TABLE "imports"`);
    await queryRunner.query(`DROP TYPE "public"."imports_status_enum"`);

    await queryRunner.query(
      `ALTER TABLE "import_profiles" DROP CONSTRAINT "FK_import_profiles_userId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_import_profiles_userId_name"`);
    await queryRunner.query(`DROP TABLE "import_profiles"`);
  }
}
