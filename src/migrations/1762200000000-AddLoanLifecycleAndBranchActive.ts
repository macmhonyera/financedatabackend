import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoanLifecycleAndBranchActive1762200000000 implements MigrationInterface {
  name = 'AddLoanLifecycleAndBranchActive1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "approvedByUserId" character varying`);
    await queryRunner.query(`ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "rejectedByUserId" character varying`);
    await queryRunner.query(`ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "rejectionReason" text`);
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN IF EXISTS "active"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "rejectionReason"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "rejectedByUserId"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "rejectedAt"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "approvedByUserId"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "approvedAt"`);
  }
}
