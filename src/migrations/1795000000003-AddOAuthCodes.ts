import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOAuthCodes1795000000003 implements MigrationInterface {
  name = 'AddOAuthCodes1795000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "oauth_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codeHash" character(64) NOT NULL, "clientId" character varying(100) NOT NULL, "userId" uuid NOT NULL, "redirectUri" character varying(500) NOT NULL, "codeChallenge" character varying(128) NOT NULL, "scope" character varying(200), "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_oauth_codes_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_oauth_codes_codeHash" ON "oauth_codes" ("codeHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_codes" ADD CONSTRAINT "FK_oauth_codes_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oauth_codes"`);
  }
}
