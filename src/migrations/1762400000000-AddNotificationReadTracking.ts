import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationReadTracking1762400000000 implements MigrationInterface {
  name = 'AddNotificationReadTracking1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "isRead" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN IF EXISTS "readAt"`);
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN IF EXISTS "isRead"`);
  }
}
