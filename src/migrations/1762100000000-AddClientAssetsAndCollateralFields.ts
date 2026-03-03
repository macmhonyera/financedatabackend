import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientAssetsAndCollateralFields1762100000000 implements MigrationInterface {
  name = 'AddClientAssetsAndCollateralFields1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_asset" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "client_id" uuid NOT NULL,
        "assetType" character varying(100) NOT NULL,
        "description" text,
        "marketValue" numeric(14,2) NOT NULL,
        "valuationDate" date NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_asset_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner
      .query(`
        ALTER TABLE "client_asset"
        ADD CONSTRAINT "FK_client_asset_client"
        FOREIGN KEY ("client_id") REFERENCES "client"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_client_asset_client" ON "client_asset" ("client_id");',
    );

    await queryRunner.query(
      'ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "isCollateralized" boolean NOT NULL DEFAULT false;',
    );
    await queryRunner.query(
      'ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "collateralTotalMarketValue" numeric(14,2);',
    );
    await queryRunner.query(
      'ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "collateralSnapshot" json;',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "loan" DROP COLUMN IF EXISTS "collateralSnapshot";');
    await queryRunner.query('ALTER TABLE "loan" DROP COLUMN IF EXISTS "collateralTotalMarketValue";');
    await queryRunner.query('ALTER TABLE "loan" DROP COLUMN IF EXISTS "isCollateralized";');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_asset_client";');
    await queryRunner.query('ALTER TABLE "client_asset" DROP CONSTRAINT IF EXISTS "FK_client_asset_client";');
    await queryRunner.query('DROP TABLE IF EXISTS "client_asset";');
  }
}
