import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentUpdatedAt1762900000000 implements MigrationInterface {
  name = 'AddPaymentUpdatedAt1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `UPDATE "payment" SET "updatedAt" = COALESCE("reconciledAt", "createdAt") WHERE "updatedAt" IS NULL OR "updatedAt" = "createdAt"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_updatedAt" ON "payment" ("updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_updatedAt"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "updatedAt"`);
  }
}
