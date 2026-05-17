import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationSettings1763400000000 implements MigrationInterface {
  name = 'AddOrganizationSettings1763400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('organization', 'settings');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "organization" ADD "settings" jsonb`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('organization', 'settings');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "organization" DROP COLUMN "settings"`);
    }
  }
}
