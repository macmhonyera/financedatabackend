import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationBrandingAndUserOrganization1762700000000
  implements MigrationInterface
{
  name = 'AddOrganizationBrandingAndUserOrganization1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL DEFAULT 'MicroFinance Pro',
        "primaryColor" character varying NOT NULL DEFAULT '30 58 138',
        "accentColor" character varying NOT NULL DEFAULT '20 184 166',
        "logoUrl" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organization_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organizationId" uuid`);

    await queryRunner.query(`
      INSERT INTO "organization" ("name", "primaryColor", "accentColor", "logoUrl")
      SELECT 'MicroFinance Pro', '30 58 138', '20 184 166', NULL
      WHERE NOT EXISTS (SELECT 1 FROM "organization");
    `);

    await queryRunner.query(`
      UPDATE "user"
      SET "organizationId" = (
        SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1
      )
      WHERE "organizationId" IS NULL;
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_user_organizationId" ON "user" ("organizationId");',
    );

    await queryRunner
      .query(`
        ALTER TABLE "user"
        ADD CONSTRAINT "FK_user_organization"
        FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "FK_user_organization";',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_user_organizationId";');
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN IF EXISTS "organizationId";');
    await queryRunner.query('DROP TABLE IF EXISTS "organization";');
  }
}
