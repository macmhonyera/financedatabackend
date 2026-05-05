import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeys1763000000000 implements MigrationInterface {
  name = 'AddIdempotencyKeys1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "idempotencyKey" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_client_idempotencyKey" ON "client" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "idempotencyKey" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_loan_idempotencyKey" ON "loan" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "payment_promises" ADD COLUMN IF NOT EXISTS "idempotency_key" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_promise_idempotency_key" ON "payment_promises" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_payment_promise_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "payment_promises" DROP COLUMN IF EXISTS "idempotency_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_loan_idempotencyKey"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "idempotencyKey"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_client_idempotencyKey"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN IF EXISTS "idempotencyKey"`);
  }
}
