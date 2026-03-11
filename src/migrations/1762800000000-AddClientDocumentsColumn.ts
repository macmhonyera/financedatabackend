import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientDocumentsColumn1762800000000 implements MigrationInterface {
  name = 'AddClientDocumentsColumn1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "documents" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN IF EXISTS "documents"`);
  }
}
