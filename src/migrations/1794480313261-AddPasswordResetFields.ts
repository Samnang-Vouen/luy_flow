import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordResetFields1794480313261 implements MigrationInterface {
    name = 'AddPasswordResetFields1794480313261'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "resetPasswordTokenHash" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "resetPasswordExpiresAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "resetPasswordExpiresAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "resetPasswordTokenHash"`);
    }

}
