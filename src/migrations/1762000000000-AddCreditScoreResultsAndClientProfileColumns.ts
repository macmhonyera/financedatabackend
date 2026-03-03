import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreditScoreResultsAndClientProfileColumns1762000000000
  implements MigrationInterface
{
  name = 'AddCreditScoreResultsAndClientProfileColumns1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_score_results" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "client_id" uuid NOT NULL,
        "loan_id" character varying,
        "score" integer NOT NULL,
        "grade" character varying(1) NOT NULL,
        "reasons" json NOT NULL,
        "model_version" character varying(64) NOT NULL,
        "inputs_snapshot" json NOT NULL,
        "computed_by_user_id" character varying,
        "computed_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credit_score_results_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "credit_score_results"
      ADD CONSTRAINT "FK_credit_score_results_client"
      FOREIGN KEY ("client_id") REFERENCES "client"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
    `).catch(() => undefined);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_credit_score_results_client_computed" ON "credit_score_results" ("client_id", "computed_at");',
    );

    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "email" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "idNumber" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "avatar" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "creditScore" integer;');
    await queryRunner.query(
      `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "collectionStatus" character varying NOT NULL DEFAULT 'current';`,
    );
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "loanOfficer" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "businessType" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "registrationNumber" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "monthlyIncome" numeric(12,2);');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "employmentType" character varying;');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT now();');
    await queryRunner.query('ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now();');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_credit_score_results_client_computed";');
    await queryRunner.query('ALTER TABLE "credit_score_results" DROP CONSTRAINT IF EXISTS "FK_credit_score_results_client";');
    await queryRunner.query('DROP TABLE IF EXISTS "credit_score_results";');

    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "updatedAt";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "createdAt";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "employmentType";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "monthlyIncome";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "registrationNumber";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "businessType";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "loanOfficer";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "collectionStatus";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "creditScore";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "avatar";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "idNumber";');
    await queryRunner.query('ALTER TABLE "client" DROP COLUMN IF EXISTS "email";');
  }
}
