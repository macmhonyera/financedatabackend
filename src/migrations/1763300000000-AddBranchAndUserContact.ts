import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchAndUserContact1763300000000 implements MigrationInterface {
  name = 'AddBranchAndUserContact1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" character varying`);
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "address" character varying`);
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "phone" character varying`);
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "manager" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "phone"`);
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN IF EXISTS "address"`);
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN IF EXISTS "phone"`);
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN IF EXISTS "manager"`);
  }
}
