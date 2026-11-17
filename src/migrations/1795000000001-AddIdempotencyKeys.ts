import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeys1795000000001 implements MigrationInterface {
  name = 'AddIdempotencyKeys1795000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."idempotency_keys_status_enum" AS ENUM('in_progress', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "key" character varying(255) NOT NULL, "requestHash" character(64) NOT NULL, "status" "public"."idempotency_keys_status_enum" NOT NULL DEFAULT 'in_progress', "responseStatus" integer, "responseBody" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP, CONSTRAINT "PK_idempotency_keys_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_idempotency_keys_userId_key" ON "idempotency_keys" ("userId", "key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD CONSTRAINT "FK_idempotency_keys_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TYPE "public"."idempotency_keys_status_enum"`);
  }
}
