import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserPreferences1794475939359 implements MigrationInterface {
    name = 'AddUserPreferences1794475939359'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "preferences" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferences"`);
    }

}
