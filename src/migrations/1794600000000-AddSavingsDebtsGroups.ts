import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSavingsDebtsGroups1794600000000 implements MigrationInterface {
  name = 'AddSavingsDebtsGroups1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Savings goals
    await queryRunner.query(
      `CREATE TYPE "public"."savings_goals_status_enum" AS ENUM('active', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "savings_goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(120) NOT NULL, "targetAmount" numeric(12,2) NOT NULL, "currentAmount" numeric(12,2) NOT NULL DEFAULT '0', "targetDate" date, "status" "public"."savings_goals_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_savings_goals_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_savings_goals_targetAmount" CHECK ("targetAmount" > 0), CONSTRAINT "CHK_savings_goals_currentAmount" CHECK ("currentAmount" >= 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_savings_goals_userId" ON "savings_goals" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goals" ADD CONSTRAINT "FK_savings_goals_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "savings_goal_contributions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "goalId" uuid NOT NULL, "userId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "note" character varying(255), "accountId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_savings_goal_contributions_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_savings_goal_contributions_amount" CHECK ("amount" > 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_savings_goal_contributions_goalId" ON "savings_goal_contributions" ("goalId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goal_contributions" ADD CONSTRAINT "FK_savings_goal_contributions_goalId" FOREIGN KEY ("goalId") REFERENCES "savings_goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_goal_contributions" ADD CONSTRAINT "FK_savings_goal_contributions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Debts
    await queryRunner.query(
      `CREATE TYPE "public"."debts_direction_enum" AS ENUM('owed_by_me', 'owed_to_me')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."debts_status_enum" AS ENUM('active', 'paid')`,
    );
    await queryRunner.query(
      `CREATE TABLE "debts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "counterparty" character varying(120) NOT NULL, "direction" "public"."debts_direction_enum" NOT NULL, "principalAmount" numeric(12,2) NOT NULL, "remainingAmount" numeric(12,2) NOT NULL, "interestRate" numeric(5,2), "dueDate" date, "notes" text, "status" "public"."debts_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_debts_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_debts_principalAmount" CHECK ("principalAmount" > 0), CONSTRAINT "CHK_debts_remainingAmount" CHECK ("remainingAmount" >= 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_debts_userId" ON "debts" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "debts" ADD CONSTRAINT "FK_debts_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "debt_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "debtId" uuid NOT NULL, "userId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "paidAt" date NOT NULL, "note" character varying(255), "accountId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_debt_payments_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_debt_payments_amount" CHECK ("amount" > 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_debt_payments_debtId" ON "debt_payments" ("debtId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payments" ADD CONSTRAINT "FK_debt_payments_debtId" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payments" ADD CONSTRAINT "FK_debt_payments_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Groups
    await queryRunner.query(
      `CREATE TYPE "public"."group_members_role_enum" AS ENUM('owner', 'member')`,
    );
    await queryRunner.query(
      `CREATE TABLE "groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerId" uuid NOT NULL, "name" character varying(120) NOT NULL, "description" character varying(255), "targetAmount" numeric(12,2), "currentAmount" numeric(12,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_groups_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_groups_targetAmount" CHECK ("targetAmount" IS NULL OR "targetAmount" > 0), CONSTRAINT "CHK_groups_currentAmount" CHECK ("currentAmount" >= 0))`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" ADD CONSTRAINT "FK_groups_ownerId" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "group_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "groupId" uuid NOT NULL, "userId" uuid NOT NULL, "role" "public"."group_members_role_enum" NOT NULL DEFAULT 'member', "joinedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_group_members_groupId_userId" UNIQUE ("groupId", "userId"), CONSTRAINT "PK_group_members_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_group_members_userId" ON "group_members" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" ADD CONSTRAINT "FK_group_members_groupId" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_members" ADD CONSTRAINT "FK_group_members_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "group_contributions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "groupId" uuid NOT NULL, "userId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "note" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_group_contributions_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_group_contributions_amount" CHECK ("amount" > 0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_group_contributions_groupId" ON "group_contributions" ("groupId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_contributions" ADD CONSTRAINT "FK_group_contributions_groupId" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_contributions" ADD CONSTRAINT "FK_group_contributions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "group_contributions"`);
    await queryRunner.query(`DROP TABLE "group_members"`);
    await queryRunner.query(`DROP TABLE "groups"`);
    await queryRunner.query(`DROP TYPE "public"."group_members_role_enum"`);
    await queryRunner.query(`DROP TABLE "debt_payments"`);
    await queryRunner.query(`DROP TABLE "debts"`);
    await queryRunner.query(`DROP TYPE "public"."debts_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."debts_direction_enum"`);
    await queryRunner.query(`DROP TABLE "savings_goal_contributions"`);
    await queryRunner.query(`DROP TABLE "savings_goals"`);
    await queryRunner.query(`DROP TYPE "public"."savings_goals_status_enum"`);
  }
}
