import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceLoanInstallmentLoanIdNotNull1762300000000 implements MigrationInterface {
  name = 'EnforceLoanInstallmentLoanIdNotNull1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "loan_installment" WHERE "loanId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "loan_installment" ALTER COLUMN "loanId" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan_installment" ALTER COLUMN "loanId" DROP NOT NULL`);
  }
}
