import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  private organizationSchemaReady = false;
  private organizationSchemaPromise: Promise<void> | null = null;

  private isOrganizationSchemaError(error: unknown) {
    const message = String((error as any)?.message || '').toLowerCase();
    return (
      (message.includes('organization') && message.includes('does not exist')) ||
      (message.includes('organizationid') && message.includes('does not exist')) ||
      message.includes('no such table: organization') ||
      message.includes('no such column: user.organizationid')
    );
  }

  private async ensureOrganizationSchema() {
    if (this.organizationSchemaReady) return;
    if (this.organizationSchemaPromise) {
      await this.organizationSchemaPromise;
      return;
    }

    this.organizationSchemaPromise = (async () => {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";').catch(() => undefined);

      await this.dataSource
        .query(`
          CREATE TABLE IF NOT EXISTS "organization" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" character varying NOT NULL DEFAULT 'MicroFinance Pro',
            "primaryColor" character varying NOT NULL DEFAULT '30 58 138',
            "accentColor" character varying NOT NULL DEFAULT '20 184 166',
            "logoUrl" text,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_organization_id" PRIMARY KEY ("id")
          );
        `)
        .catch(() => undefined);

      await this.dataSource
        .query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organizationId" uuid`)
        .catch(() => undefined);

      await this.dataSource
        .query(
          'CREATE INDEX IF NOT EXISTS "IDX_user_organizationId" ON "user" ("organizationId");',
        )
        .catch(() => undefined);

      await this.dataSource
        .query(`
          ALTER TABLE "user"
          ADD CONSTRAINT "FK_user_organization"
          FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        `)
        .catch(() => undefined);

      await this.dataSource
        .query(`
          INSERT INTO "organization" ("name", "primaryColor", "accentColor", "logoUrl")
          SELECT 'MicroFinance Pro', '30 58 138', '20 184 166', NULL
          WHERE NOT EXISTS (SELECT 1 FROM "organization");
        `)
        .catch(() => undefined);

      await this.dataSource
        .query(`
          UPDATE "user"
          SET "organizationId" = (
            SELECT "id" FROM "organization" ORDER BY "createdAt" ASC LIMIT 1
          )
          WHERE "organizationId" IS NULL;
        `)
        .catch(() => undefined);

      this.organizationSchemaReady = true;
    })().finally(() => {
      this.organizationSchemaPromise = null;
    });

    await this.organizationSchemaPromise;
  }

  private async withOrganizationSchemaRetry<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (!this.isOrganizationSchemaError(error)) throw error;
      await this.ensureOrganizationSchema();
      return run();
    }
  }

  findByEmail(email: string) {
    return this.withOrganizationSchemaRetry(() =>
      this.repo.findOne({ where: { email }, relations: ['branch', 'organization'] }),
    );
  }

  findById(id: string) {
    return this.withOrganizationSchemaRetry(() =>
      this.repo.findOne({ where: { id }, relations: ['branch', 'organization'] }),
    );
  }

  create(user: Partial<User>) {
    const e = this.repo.create(user as any);
    return this.repo.save(e);
  }

  async all() {
    return this.withOrganizationSchemaRetry(() =>
      this.repo.find({ relations: ['branch', 'organization'] }),
    );
  }
}
