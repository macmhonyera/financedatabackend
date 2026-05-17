import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientLastUpdatedBy1763600000000 implements MigrationInterface {
  name = 'AddClientLastUpdatedBy1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('client', 'lastUpdatedByUserId'))) {
      await queryRunner.query(`ALTER TABLE "client" ADD "lastUpdatedByUserId" varchar(64)`);
    }
    if (!(await queryRunner.hasColumn('client', 'lastUpdatedByName'))) {
      await queryRunner.query(`ALTER TABLE "client" ADD "lastUpdatedByName" varchar(200)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['lastUpdatedByUserId', 'lastUpdatedByName']) {
      if (await queryRunner.hasColumn('client', col)) {
        await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "${col}"`);
      }
    }
  }
}
