import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSavingsGoalCurrencyAndExternalRef1795000000000
  implements MigrationInterface
{
  name = 'AddSavingsGoalCurrencyAndExternalRef1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing goals were created before currencies existed; treat them as USD.
    await queryRunner.query(
      `ALTER TABLE "savings_goals" ADD "currency" character varying(3) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" ADD "externalSource" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" ADD "externalId" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" ADD CONSTRAINT "CHK_savings_goals_externalRef" CHECK (("externalSource" IS NULL) = ("externalId" IS NULL))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_savings_goals_userId_externalRef" ON "savings_goals" ("userId", "externalSource", "externalId") WHERE "externalSource" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_savings_goals_userId_externalRef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" DROP CONSTRAINT "CHK_savings_goals_externalRef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" DROP COLUMN "externalId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" DROP COLUMN "externalSource"`,
    );
    await queryRunner.query(`ALTER TABLE "savings_goals" DROP COLUMN "currency"`);
  }
}
