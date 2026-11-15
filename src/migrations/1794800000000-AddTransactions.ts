import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactions1794800000000 implements MigrationInterface {
  name = 'AddTransactions1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "accountId" uuid NOT NULL, "categoryId" uuid, "paymentMethodId" uuid, "type" "public"."transactions_type_enum" NOT NULL, "amount" numeric(14,2) NOT NULL, "currency" character(3) NOT NULL, "date" date NOT NULL, "description" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_transactions_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_transactions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_userId_date" ON "transactions" ("userId", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_accountId" ON "transactions" ("accountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_categoryId" ON "transactions" ("categoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_paymentMethodId" ON "transactions" ("paymentMethodId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // NO ACTION (not RESTRICT) so deleting a user can cascade to both accounts and transactions.
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_accountId" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_categoryId" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_paymentMethodId" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_paymentMethodId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_categoryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_accountId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_userId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_paymentMethodId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_categoryId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_accountId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_userId_date"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
  }
}
