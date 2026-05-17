import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetPhotosAndPaymentReceipts1763500000000 implements MigrationInterface {
  name = 'AddAssetPhotosAndPaymentReceipts1763500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Asset photo columns
    if (!(await queryRunner.hasColumn('client_asset', 'photoDataUrl'))) {
      await queryRunner.query(`ALTER TABLE "client_asset" ADD "photoDataUrl" text`);
    }
    if (!(await queryRunner.hasColumn('client_asset', 'photoCapturedBy'))) {
      await queryRunner.query(`ALTER TABLE "client_asset" ADD "photoCapturedBy" varchar(200)`);
    }
    if (!(await queryRunner.hasColumn('client_asset', 'photoCapturedAt'))) {
      await queryRunner.query(`ALTER TABLE "client_asset" ADD "photoCapturedAt" TIMESTAMP`);
    }

    // Payment receipt columns
    if (!(await queryRunner.hasColumn('payment', 'receiptDataUrl'))) {
      await queryRunner.query(`ALTER TABLE "payment" ADD "receiptDataUrl" text`);
    }
    if (!(await queryRunner.hasColumn('payment', 'receiptNumber'))) {
      await queryRunner.query(`ALTER TABLE "payment" ADD "receiptNumber" varchar(32)`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_receiptNumber" ON "payment" ("receiptNumber")`,
      );
    }
    if (!(await queryRunner.hasColumn('payment', 'issuedByUserId'))) {
      await queryRunner.query(`ALTER TABLE "payment" ADD "issuedByUserId" varchar(64)`);
    }
    if (!(await queryRunner.hasColumn('payment', 'issuedByName'))) {
      await queryRunner.query(`ALTER TABLE "payment" ADD "issuedByName" varchar(200)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['photoDataUrl', 'photoCapturedBy', 'photoCapturedAt']) {
      if (await queryRunner.hasColumn('client_asset', col)) {
        await queryRunner.query(`ALTER TABLE "client_asset" DROP COLUMN "${col}"`);
      }
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_receiptNumber"`);
    for (const col of ['receiptDataUrl', 'receiptNumber', 'issuedByUserId', 'issuedByName']) {
      if (await queryRunner.hasColumn('payment', col)) {
        await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "${col}"`);
      }
    }
  }
}
