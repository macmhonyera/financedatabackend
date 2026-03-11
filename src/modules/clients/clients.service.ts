import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Client, ClientDocumentRecord, ClientDocumentType } from '../../entities/client.entity';
import { UploadClientDocumentDto } from './dto/upload-client-document.dto';

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

  create(data: Partial<Client>) {
    const e = this.repo.create(data as any);
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

  async updateScoped(id: string, updates: Partial<Client>, user: any) {
    await this.findByIdScoped(id, user);
    await this.repo.update(id, updates as any);
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
        documentType: String(row.documentType || 'other') as ClientDocumentType,
        documentName: String(row.documentName || 'document'),
        mimeType: String(row.mimeType || 'application/octet-stream'),
        sizeBytes: Number(row.sizeBytes || 0),
        dataUrl: String(row.dataUrl || ''),
        documentNumber: row.documentNumber ? String(row.documentNumber) : undefined,
        expiryDate: row.expiryDate ? String(row.expiryDate) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        uploadedAt: String(row.uploadedAt || new Date().toISOString()),
        uploadedByUserId: row.uploadedByUserId ? String(row.uploadedByUserId) : undefined,
        uploadedByName: row.uploadedByName ? String(row.uploadedByName) : undefined,
      }))
      .filter((row) => row.id && row.dataUrl);
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

    const parsed = this.parseDataUrl(dto.dataUrl);
    if (!this.allowedDocumentMimeTypes.has(parsed.mimeType)) {
      throw new BadRequestException('Only PDF/JPG/PNG/WEBP documents are allowed.');
    }

    const sizeBytes = this.estimateSizeBytes(parsed.base64Data);
    if (sizeBytes > this.documentMaxSizeBytes) {
      throw new BadRequestException('Document file is too large. Maximum size is 6MB.');
    }

    const client = await this.findByIdWithDocuments(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const currentDocuments = this.normalizeDocumentList((client as any).documents);
    const uploadedAt = new Date().toISOString();
    const savedDoc: ClientDocumentRecord = {
      id: randomUUID(),
      documentType: dto.documentType,
      documentName: this.resolveDocumentName(dto.documentType, dto.documentName, parsed.mimeType),
      mimeType: parsed.mimeType,
      sizeBytes,
      dataUrl: parsed.normalizedDataUrl,
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
