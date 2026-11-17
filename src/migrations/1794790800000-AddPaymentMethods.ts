import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethods1794790800000 implements MigrationInterface {
  name = 'AddPaymentMethods1794790800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payment_methods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(60) NOT NULL, "isArchived" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_payment_methods_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_methods_userId_name" ON "payment_methods" ("userId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD CONSTRAINT "FK_payment_methods_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP CONSTRAINT "FK_payment_methods_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_methods_userId_name"`,
    );
    await queryRunner.query(`DROP TABLE "payment_methods"`);
  }
}
