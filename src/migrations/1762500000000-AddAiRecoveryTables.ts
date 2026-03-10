import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiRecoveryTables1762500000000 implements MigrationInterface {
  name = 'AddAiRecoveryTables1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "borrower_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "borrower_id" uuid NOT NULL,
        "loan_id" uuid,
        "channel" character varying NOT NULL DEFAULT 'whatsapp',
        "direction" character varying NOT NULL,
        "message_type" character varying NOT NULL DEFAULT 'incoming_query',
        "message_content" text NOT NULL,
        "ai_response" text,
        "provider_message_id" character varying,
        "status" character varying NOT NULL DEFAULT 'received',
        "metadata" json,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_borrower_messages_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner
      .query(`
        ALTER TABLE "borrower_messages"
        ADD CONSTRAINT "FK_borrower_messages_borrower"
        FOREIGN KEY ("borrower_id") REFERENCES "client"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner
      .query(`
        ALTER TABLE "borrower_messages"
        ADD CONSTRAINT "FK_borrower_messages_loan"
        FOREIGN KEY ("loan_id") REFERENCES "loan"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_borrower_messages_borrower" ON "borrower_messages" ("borrower_id");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_borrower_messages_loan" ON "borrower_messages" ("loan_id");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_borrower_messages_timestamp" ON "borrower_messages" ("timestamp");',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_promises" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "borrower_id" uuid NOT NULL,
        "loan_id" uuid,
        "message_id" uuid,
        "promised_amount" numeric(12,2),
        "promised_date" date,
        "status" character varying NOT NULL DEFAULT 'open',
        "notes" text,
        "resolved_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_promises_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner
      .query(`
        ALTER TABLE "payment_promises"
        ADD CONSTRAINT "FK_payment_promises_borrower"
        FOREIGN KEY ("borrower_id") REFERENCES "client"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner
      .query(`
        ALTER TABLE "payment_promises"
        ADD CONSTRAINT "FK_payment_promises_loan"
        FOREIGN KEY ("loan_id") REFERENCES "loan"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner
      .query(`
        ALTER TABLE "payment_promises"
        ADD CONSTRAINT "FK_payment_promises_message"
        FOREIGN KEY ("message_id") REFERENCES "borrower_messages"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_payment_promises_borrower" ON "payment_promises" ("borrower_id");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_payment_promises_loan" ON "payment_promises" ("loan_id");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_payment_promises_status" ON "payment_promises" ("status");',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recovery_actions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "borrower_id" uuid NOT NULL,
        "loan_id" uuid,
        "message_id" uuid,
        "action_type" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "risk_score" integer NOT NULL DEFAULT 0,
        "risk_category" character varying NOT NULL DEFAULT 'LOW',
        "details" json,
        "scheduled_for" TIMESTAMP,
        "executed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recovery_actions_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner
      .query(`
        ALTER TABLE "recovery_actions"
        ADD CONSTRAINT "FK_recovery_actions_borrower"
        FOREIGN KEY ("borrower_id") REFERENCES "client"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner
      .query(`
        ALTER TABLE "recovery_actions"
        ADD CONSTRAINT "FK_recovery_actions_loan"
        FOREIGN KEY ("loan_id") REFERENCES "loan"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner
      .query(`
        ALTER TABLE "recovery_actions"
        ADD CONSTRAINT "FK_recovery_actions_message"
        FOREIGN KEY ("message_id") REFERENCES "borrower_messages"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
      `)
      .catch(() => undefined);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_recovery_actions_borrower" ON "recovery_actions" ("borrower_id");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_recovery_actions_loan" ON "recovery_actions" ("loan_id");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_recovery_actions_status" ON "recovery_actions" ("status");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_recovery_actions_risk_category" ON "recovery_actions" ("risk_category");',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_recovery_actions_risk_category";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_recovery_actions_status";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_recovery_actions_loan";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_recovery_actions_borrower";');
    await queryRunner.query(
      'ALTER TABLE "recovery_actions" DROP CONSTRAINT IF EXISTS "FK_recovery_actions_message";',
    );
    await queryRunner.query(
      'ALTER TABLE "recovery_actions" DROP CONSTRAINT IF EXISTS "FK_recovery_actions_loan";',
    );
    await queryRunner.query(
      'ALTER TABLE "recovery_actions" DROP CONSTRAINT IF EXISTS "FK_recovery_actions_borrower";',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "recovery_actions";');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_payment_promises_status";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_payment_promises_loan";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_payment_promises_borrower";');
    await queryRunner.query(
      'ALTER TABLE "payment_promises" DROP CONSTRAINT IF EXISTS "FK_payment_promises_message";',
    );
    await queryRunner.query(
      'ALTER TABLE "payment_promises" DROP CONSTRAINT IF EXISTS "FK_payment_promises_loan";',
    );
    await queryRunner.query(
      'ALTER TABLE "payment_promises" DROP CONSTRAINT IF EXISTS "FK_payment_promises_borrower";',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "payment_promises";');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_borrower_messages_timestamp";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_borrower_messages_loan";');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_borrower_messages_borrower";');
    await queryRunner.query(
      'ALTER TABLE "borrower_messages" DROP CONSTRAINT IF EXISTS "FK_borrower_messages_loan";',
    );
    await queryRunner.query(
      'ALTER TABLE "borrower_messages" DROP CONSTRAINT IF EXISTS "FK_borrower_messages_borrower";',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "borrower_messages";');
  }
}
