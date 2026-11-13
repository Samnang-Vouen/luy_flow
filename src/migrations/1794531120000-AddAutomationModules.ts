import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutomationModules1794531120000 implements MigrationInterface {
  name = 'AddAutomationModules1794531120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_type_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_frequency_enum" AS ENUM('daily', 'weekly', 'monthly', 'yearly')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_status_enum" AS ENUM('active', 'paused')`,
    );
    await queryRunner.query(
      `CREATE TABLE "recurring_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "accountId" uuid NOT NULL, "description" character varying(160) NOT NULL, "amount" numeric(12,2) NOT NULL, "type" "public"."recurring_transactions_type_enum" NOT NULL, "frequency" "public"."recurring_transactions_frequency_enum" NOT NULL, "startDate" date NOT NULL, "endDate" date, "status" "public"."recurring_transactions_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_recurring_transactions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recurring_transactions_userId" ON "recurring_transactions" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_transactions" ADD CONSTRAINT "FK_recurring_transactions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying(160) NOT NULL, "message" text NOT NULL, "metadata" jsonb, "readAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorUserId" uuid, "action" character varying(120) NOT NULL, "resourceType" character varying(120) NOT NULL, "resourceId" character varying(120), "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actorUserId_createdAt" ON "audit_logs" ("actorUserId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_actorUserId" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_actorUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_audit_logs_actorUserId_createdAt"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_userId_createdAt"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `ALTER TABLE "recurring_transactions" DROP CONSTRAINT "FK_recurring_transactions_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_recurring_transactions_userId"`,
    );
    await queryRunner.query(`DROP TABLE "recurring_transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."recurring_transactions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."recurring_transactions_frequency_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."recurring_transactions_type_enum"`,
    );
  }
}
