import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionImportFields1794810000000
  implements MigrationInterface
{
  name = 'AddTransactionImportFields1794810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_source_enum" AS ENUM('manual', 'import')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "source" "public"."transactions_source_enum" NOT NULL DEFAULT 'manual'`,
    );
    // FK to "imports" is added by the imports migration, once that table exists.
    await queryRunner.query(`ALTER TABLE "transactions" ADD "importId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "externalRef" character varying(64)`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" ADD "rawDetails" text`);
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_importId" ON "transactions" ("importId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_transactions_accountId_externalRef" ON "transactions" ("accountId", "externalRef") WHERE "externalRef" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_transactions_accountId_externalRef"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_importId"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "rawDetails"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "externalRef"`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "importId"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "source"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_source_enum"`);
  }
}
