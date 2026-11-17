import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategories1794787200000 implements MigrationInterface {
  name = 'AddCategories1794787200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."categories_type_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(60) NOT NULL, "type" "public"."categories_type_enum" NOT NULL, "isArchived" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_categories_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_categories_userId_type_name" ON "categories" ("userId", "type", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_categories_userId_type_name"`,
    );
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TYPE "public"."categories_type_enum"`);
  }
}
