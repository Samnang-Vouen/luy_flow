import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Refresh tokens are now stored as SHA-256 digests and looked up by equality.
 * Existing rows hold Argon2 hashes which can never match a SHA-256 lookup, so
 * they are cleared once: every client logs in again, and no dead rows remain.
 */
export class AddSessionIndexes1795000000002 implements MigrationInterface {
    name = 'AddSessionIndexes1795000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "sessions"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_sessions_refreshTokenHash" ON "sessions" ("refreshTokenHash")`);
        await queryRunner.query(`CREATE INDEX "IDX_sessions_userId" ON "sessions" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_sessions_expiresAt" ON "sessions" ("expiresAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_sessions_expiresAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_sessions_userId"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_sessions_refreshTokenHash"`);
    }

}
