import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBudgets1794900000000 implements MigrationInterface {
  name = 'AddBudgets1794900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "budgets" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "categoryId" uuid,
      "month" varchar(7) NOT NULL,
      "currency" char(3) NOT NULL,
      "amount" numeric(14,2) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_budgets_id" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_budgets_amount_positive" CHECK ("amount" > 0),
      CONSTRAINT "CHK_budgets_month" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      CONSTRAINT "FK_budgets_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_budgets_categoryId" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_budgets_userId_month" ON "budgets" ("userId", "month")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_budgets_overall" ON "budgets" ("userId", "month", "currency") WHERE "categoryId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_budgets_category" ON "budgets" ("userId", "month", "currency", "categoryId") WHERE "categoryId" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "budgets"');
  }
}
