import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserIsActive1794483480851 implements MigrationInterface {
    name = 'AddUserIsActive1794483480851'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
    }

}
