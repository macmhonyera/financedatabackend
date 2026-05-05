import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldVisitsAndStorageKeys1763100000000 implements MigrationInterface {
  name = 'AddFieldVisitsAndStorageKeys1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "receiptImageKey" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "signatureImageKey" character varying`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "field_visit" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotencyKey" character varying,
        "clientId" uuid NOT NULL,
        "officerUserId" character varying NOT NULL,
        "officerName" character varying,
        "latitude" numeric(9, 6),
        "longitude" numeric(9, 6),
        "capturedAt" TIMESTAMP NOT NULL,
        "notes" text,
        "photoStorageKey" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_field_visit_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_field_visit_client" FOREIGN KEY ("clientId")
          REFERENCES "client"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_field_visit_idempotencyKey" ON "field_visit" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_field_visit_clientId" ON "field_visit" ("clientId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_field_visit_updatedAt" ON "field_visit" ("updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_field_visit_updatedAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_field_visit_clientId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_field_visit_idempotencyKey"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "field_visit"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "signatureImageKey"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "receiptImageKey"`);
  }
}
