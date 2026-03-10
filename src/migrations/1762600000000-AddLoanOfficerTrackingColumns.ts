import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoanOfficerTrackingColumns1762600000000 implements MigrationInterface {
  name = 'AddLoanOfficerTrackingColumns1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "loanOfficer" character varying`);
    await queryRunner.query(
      `ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "appliedByUserId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "loan" ADD COLUMN IF NOT EXISTS "appliedByName" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "appliedByName"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "appliedByUserId"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN IF EXISTS "loanOfficer"`);
  }
}
