import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccounts1794614400000 implements MigrationInterface {
  name = 'AddAccounts1794614400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."accounts_type_enum" AS ENUM('cash', 'bank')`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(100) NOT NULL, "type" "public"."accounts_type_enum" NOT NULL, "currency" character(3) NOT NULL, "openingBalance" numeric(14,2) NOT NULL DEFAULT '0', "isArchived" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_accounts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_accounts_userId_name" ON "accounts" ("userId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD CONSTRAINT "FK_accounts_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP CONSTRAINT "FK_accounts_userId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_accounts_userId_name"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TYPE "public"."accounts_type_enum"`);
  }
}
