import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserActive1763200000000 implements MigrationInterface {
  name = 'AddUserActive1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "active"`);
  }
}
