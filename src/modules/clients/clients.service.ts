import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Client, ClientDocumentRecord, ClientDocumentType } from '../../entities/client.entity';
import { UploadClientDocumentDto } from './dto/upload-client-document.dto';
import { assertIfMatch } from '../../common/precondition';

const normalizePhone = (raw: string | undefined | null): string => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D+/g, '');
  // Zimbabwean local trunk-prefix form: "0XX XXX XXXX" → drop leading 0
  if (digits.length === 10 && digits.startsWith('0')) return digits.slice(1);
  // International with country code: "263XX XXX XXXX" → drop 263
  if (digits.length === 12 && digits.startsWith('263')) return digits.slice(3);
  return digits;
};

const normalizeEmail = (raw: string | undefined | null): string => {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
};

const normalizeIdNumber = (raw: string | undefined | null): string => {
  if (!raw) return '';
  // Strip whitespace, hyphens, underscores so "AB 12 34", "AB-1234", "ab_1234" all match.
  return String(raw).replace(/[\s\-_]+/g, '').toUpperCase();
};

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private repo: Repository<Client>,
    private readonly dataSource: DataSource,
  ) {}

  private documentsSchemaReady = false;
  private documentsSchemaPromise: Promise<void> | null = null;

  private readonly allowedProfilePhotoMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly allowedDocumentMimeTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  private readonly profilePhotoMaxSizeBytes = 1 * 1024 * 1024;
  private readonly documentMaxSizeBytes = 6 * 1024 * 1024;

  /**
   * Look for an existing client across ALL branches matching any of the uniqueness
   * fields (national ID, phone, email). Returns the first match, normalized to
   * a friendly { field, client } object so callers can build a helpful message.
   */
  private async findDuplicate(
    data: Partial<Client>,
    excludeId?: string,
  ): Promise<{ field: 'idNumber' | 'phone' | 'email'; client: Client } | null> {
    const id = normalizeIdNumber(data.idNumber);
    const phone = normalizePhone(data.phone);
    const email = normalizeEmail(data.email);
    if (!id && !phone && !email) return null;

    const qb = this.repo
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.branch', 'branch')
      .where('1 = 0');

    if (id) {
      qb.orWhere(
        // Strip whitespace + uppercase before comparing so "AB 12 34" === "ab1234"
        `UPPER(REPLACE(REPLACE(REPLACE(COALESCE(client.idNumber, ''), ' ', ''), '-', ''), '_', '')) = :id`,
        { id },
      );
    }
    if (phone) {
      // Apply the same Zimbabwe-aware normalization in SQL so "+263 77 1234567",
      // "0771234567", and "+263771234567" all collide.
      qb.orWhere(
        `CASE
           WHEN length(regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g')) = 10
                AND regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g') LIKE '0%'
             THEN substring(regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g'), 2)
           WHEN length(regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g')) = 12
                AND regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g') LIKE '263%'
             THEN substring(regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g'), 4)
           ELSE regexp_replace(COALESCE(client.phone, ''), '[^0-9]', '', 'g')
         END = :phone`,
        { phone },
      );
    }
    if (email) {
      qb.orWhere('LOWER(COALESCE(client.email, \'\')) = :email', { email });
    }

    if (excludeId) {
      qb.andWhere('client.id != :excludeId', { excludeId });
    }

    const candidate = await qb.getOne();
    if (!candidate) return null;

    // Pick the field that actually matched so we can tell the officer which one.
    if (id && normalizeIdNumber(candidate.idNumber) === id) {
      return { field: 'idNumber', client: candidate };
    }
    if (phone && normalizePhone(candidate.phone) === phone) {
      return { field: 'phone', client: candidate };
    }
    return { field: 'email', client: candidate };
  }

  private throwDuplicate(
    match: { field: 'idNumber' | 'phone' | 'email'; client: Client },
    user: any,
  ): never {
    const fieldLabel = match.field === 'idNumber' ? 'national ID' : match.field;
    const sameBranch =
      user?.role === 'admin' ||
      ((match.client.branch as any)?.id && (match.client.branch as any).id === user?.branch);

    if (sameBranch) {
      // The officer can already see this client — give them everything they need
      // to navigate to it.
      throw new ConflictException({
        statusCode: 409,
        error: 'DuplicateClient',
        message: `A client with this ${fieldLabel} already exists at your branch: ${match.client.name}.`,
        field: match.field,
        clientId: match.client.id,
        clientName: match.client.name,
        sameBranch: true,
        branchName: (match.client.branch as any)?.name || null,
      });
    }

    // Cross-branch duplicate: signal the officer to escalate to admin without
    // leaking the other branch's client details.
    throw new ConflictException({
      statusCode: 409,
      error: 'DuplicateClient',
      message: `A client with this ${fieldLabel} is already registered at another branch (${(match.client.branch as any)?.name || 'unknown'}). Contact your administrator to transfer or merge the record.`,
      field: match.field,
      sameBranch: false,
      branchName: (match.client.branch as any)?.name || null,
    });
  }

  async create(data: Partial<Client>, user?: any) {
    const idempotencyKey = (data as any).idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = await this.repo.findOne({
        where: { idempotencyKey } as any,
        relations: ['branch', 'loans'],
      });
      if (existing) return existing;
    }

    const duplicate = await this.findDuplicate(data);
    if (duplicate) this.throwDuplicate(duplicate, user);

    const e = this.repo.create({ ...(data as any), idempotencyKey: idempotencyKey || undefined });
    return this.repo.save(e);
  }

  findAll() {
    return this.repo.find({ relations: ['branch', 'loans'] });
  }

  // Return clients scoped to user: admins get all, branch users get only their branch
  findAllScoped(user: any) {
    if (!user || user.role === 'admin') return this.findAll();
    return this.repo.find({ where: { branch: { id: user.branch } as any }, relations: ['branch', 'loans'] });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['branch', 'loans'] });
  }

  async findByIdScoped(id: string, user: any) {
    const client = await this.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    if (user?.role === 'admin') return client;

    const clientBranchId = (client.branch as any)?.id;
    if (!user?.branch || clientBranchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to access this client');
    }
    return client;
  }

  async update(id: string, updates: Partial<Client>) {
    await this.repo.update(id, updates as any);
    return this.findById(id);
  }

  async updateScoped(id: string, updates: Partial<Client>, user: any, ifMatch?: string) {
    const existing = await this.findByIdScoped(id, user);
    assertIfMatch(ifMatch, existing.updatedAt, existing);

    // Only run duplicate detection if a uniqueness field is actually being changed,
    // and only against OTHER clients (excludeId = current).
    const changesUnique =
      (updates.idNumber !== undefined && normalizeIdNumber(updates.idNumber) !== normalizeIdNumber(existing.idNumber)) ||
      (updates.phone !== undefined && normalizePhone(updates.phone) !== normalizePhone(existing.phone)) ||
      (updates.email !== undefined && normalizeEmail(updates.email) !== normalizeEmail(existing.email));

    if (changesUnique) {
      const dup = await this.findDuplicate(
        {
          idNumber: updates.idNumber ?? existing.idNumber,
          phone: updates.phone ?? existing.phone,
          email: updates.email ?? existing.email,
        } as Partial<Client>,
        id,
      );
      if (dup) this.throwDuplicate(dup, user);
    }

    const editorId = (user?.id as string | undefined) || undefined;
    const editorName =
      (user?.name as string | undefined) || (user?.email as string | undefined) || undefined;
    const stamped: any = {
      ...updates,
      lastUpdatedByUserId: editorId,
      lastUpdatedByName: editorName,
    };

    await this.repo.update(id, stamped);
    return this.findById(id);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }

  private isDocumentsSchemaError(error: unknown) {
    const message = String((error as any)?.message || '').toLowerCase();
    return (
      (message.includes('documents') && message.includes('does not exist')) ||
      message.includes('no such column: client.documents')
    );
  }

  private async ensureDocumentsSchema() {
    if (this.documentsSchemaReady) return;
    if (this.documentsSchemaPromise) {
      await this.documentsSchemaPromise;
      return;
    }

    this.documentsSchemaPromise = (async () => {
      await this.dataSource
        .query(`ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "documents" text`)
        .catch(() => undefined);
      this.documentsSchemaReady = true;
    })().finally(() => {
      this.documentsSchemaPromise = null;
    });

    await this.documentsSchemaPromise;
  }

  private async withDocumentsSchemaRetry<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (!this.isDocumentsSchemaError(error)) throw error;
      await this.ensureDocumentsSchema();
      return run();
    }
  }

  private parseDataUrl(dataUrl: string) {
    const match = String(dataUrl || '').match(/^data:([\w.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw new BadRequestException('Invalid file format. Upload must be a base64 data URL.');
    }

    return {
      mimeType: match[1].toLowerCase(),
      base64Data: match[2],
      normalizedDataUrl: dataUrl,
    };
  }

  private estimateSizeBytes(base64Data: string) {
    const normalized = base64Data.trim();
    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
  }

  private normalizeDocumentList(input: unknown): ClientDocumentRecord[] {
    if (!Array.isArray(input)) return [];

    return input
      .filter((row) => row && typeof row === 'object')
      .map((row: any) => ({
        id: String(row.id || ''),
        idempotencyKey: row.idempotencyKey ? String(row.idempotencyKey) : undefined,
        documentType: String(row.documentType || 'other') as ClientDocumentType,
        documentName: String(row.documentName || 'document'),
        mimeType: String(row.mimeType || 'application/octet-stream'),
        sizeBytes: Number(row.sizeBytes || 0),
        dataUrl: row.dataUrl ? String(row.dataUrl) : undefined,
        storageKey: row.storageKey ? String(row.storageKey) : undefined,
        documentNumber: row.documentNumber ? String(row.documentNumber) : undefined,
        expiryDate: row.expiryDate ? String(row.expiryDate) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        uploadedAt: String(row.uploadedAt || new Date().toISOString()),
        uploadedByUserId: row.uploadedByUserId ? String(row.uploadedByUserId) : undefined,
        uploadedByName: row.uploadedByName ? String(row.uploadedByName) : undefined,
      }))
      .filter((row) => row.id && (row.dataUrl || row.storageKey));
  }

  private extensionByMimeType(mimeType: string) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
  }

  private defaultNameByType(documentType: ClientDocumentType) {
    if (documentType === 'national_id') return 'National ID';
    if (documentType === 'shop_license') return 'Shop License';
    if (documentType === 'car_registration') return 'Car Registration';
    if (documentType === 'title_deed') return 'Title Deed';
    return 'Supporting Document';
  }

  private resolveDocumentName(
    documentType: ClientDocumentType,
    providedName: string | undefined,
    mimeType: string,
  ) {
    const baseName = String(providedName || '').trim() || this.defaultNameByType(documentType);
    if (/\.[a-z0-9]{2,5}$/i.test(baseName)) return baseName;
    return `${baseName}.${this.extensionByMimeType(mimeType)}`;
  }

  private async findByIdWithDocuments(clientId: string) {
    return this.withDocumentsSchemaRetry(() =>
      this.repo
        .createQueryBuilder('client')
        .addSelect('client.documents')
        .where('client.id = :clientId', { clientId })
        .getOne(),
    );
  }

  async listDocumentsScoped(clientId: string, user: any) {
    await this.findByIdScoped(clientId, user);
    const client = await this.findByIdWithDocuments(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const documents = this.normalizeDocumentList((client as any).documents);
    return documents.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async uploadDocumentScoped(clientId: string, dto: UploadClientDocumentDto, user: any) {
    await this.findByIdScoped(clientId, user);

    const client = await this.findByIdWithDocuments(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const currentDocuments = this.normalizeDocumentList((client as any).documents);

    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = currentDocuments.find((doc) => doc.idempotencyKey === idempotencyKey);
      if (existing) return existing;
    }

    let mimeType: string;
    let sizeBytes: number;
    let dataUrl: string | undefined;
    let storageKey: string | undefined;

    if (dto.storageKey) {
      storageKey = dto.storageKey;
      mimeType = String(dto.mimeType || '').toLowerCase();
      sizeBytes = Number(dto.sizeBytes || 0);
      if (!this.allowedDocumentMimeTypes.has(mimeType)) {
        throw new BadRequestException('Only PDF/JPG/PNG/WEBP documents are allowed.');
      }
      if (sizeBytes <= 0 || sizeBytes > this.documentMaxSizeBytes) {
        throw new BadRequestException('Document size must be 1B-6MB.');
      }
    } else if (dto.dataUrl) {
      const parsed = this.parseDataUrl(dto.dataUrl);
      if (!this.allowedDocumentMimeTypes.has(parsed.mimeType)) {
        throw new BadRequestException('Only PDF/JPG/PNG/WEBP documents are allowed.');
      }
      sizeBytes = this.estimateSizeBytes(parsed.base64Data);
      if (sizeBytes > this.documentMaxSizeBytes) {
        throw new BadRequestException('Document file is too large. Maximum size is 6MB.');
      }
      mimeType = parsed.mimeType;
      dataUrl = parsed.normalizedDataUrl;
    } else {
      throw new BadRequestException('Provide either dataUrl or storageKey.');
    }

    const uploadedAt = new Date().toISOString();
    const savedDoc: ClientDocumentRecord = {
      id: randomUUID(),
      idempotencyKey: idempotencyKey || undefined,
      documentType: dto.documentType,
      documentName: this.resolveDocumentName(dto.documentType, dto.documentName, mimeType),
      mimeType,
      sizeBytes,
      dataUrl,
      storageKey,
      documentNumber: dto.documentNumber?.trim() || undefined,
      expiryDate: dto.expiryDate,
      notes: dto.notes?.trim() || undefined,
      uploadedAt,
      uploadedByUserId: user?.id || undefined,
      uploadedByName: user?.name || undefined,
    };

    const nextDocuments = [savedDoc, ...currentDocuments];
    await this.withDocumentsSchemaRetry(() =>
      this.repo.update(clientId, { documents: nextDocuments as any }),
    );

    return savedDoc;
  }

  async deleteDocumentScoped(clientId: string, documentId: string, user: any) {
    await this.findByIdScoped(clientId, user);

    const client = await this.findByIdWithDocuments(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const currentDocuments = this.normalizeDocumentList((client as any).documents);
    const nextDocuments = currentDocuments.filter((document) => document.id !== documentId);

    if (nextDocuments.length === currentDocuments.length) {
      throw new NotFoundException('Document not found');
    }

    await this.withDocumentsSchemaRetry(() =>
      this.repo.update(clientId, { documents: nextDocuments as any }),
    );

    return { deleted: true };
  }

  async updateProfilePhotoScoped(clientId: string, dataUrl: string, user: any) {
    await this.findByIdScoped(clientId, user);

    const parsed = this.parseDataUrl(dataUrl);
    if (!this.allowedProfilePhotoMimeTypes.has(parsed.mimeType)) {
      throw new BadRequestException('Profile photo must be JPG/PNG/WEBP.');
    }

    const sizeBytes = this.estimateSizeBytes(parsed.base64Data);
    if (sizeBytes > this.profilePhotoMaxSizeBytes) {
      throw new BadRequestException('Profile photo is too large. Maximum size is 1MB.');
    }

    await this.repo.update(clientId, { avatar: parsed.normalizedDataUrl });
    return this.findById(clientId);
  }
}
