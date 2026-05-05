import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PresignedUpload, StorageProvider, StorageScope } from './storage.types';

const ALLOWED_SCOPES: ReadonlySet<StorageScope> = new Set([
  'client-documents',
  'client-photos',
  'payment-receipts',
  'loan-signatures',
  'field-visits',
]);

@Injectable()
export class LocalFsStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalFsStorageProvider.name);
  private readonly rootDir: string;
  private readonly baseUrl: string;
  private readonly signingSecret: string;

  constructor() {
    this.rootDir =
      process.env.STORAGE_LOCAL_DIR ||
      path.resolve(process.cwd(), 'storage');
    this.baseUrl = (process.env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:3031/storage/files').replace(/\/+$/, '');
    this.signingSecret = process.env.STORAGE_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-storage-secret';
    this.logger.log(`Local FS storage rooted at ${this.rootDir}; public base ${this.baseUrl}`);
  }

  getRootDir() {
    return this.rootDir;
  }

  async presignUpload(input: {
    scope: StorageScope;
    contentType: string;
    sizeBytes: number;
    suggestedFilename?: string;
  }): Promise<PresignedUpload> {
    if (!ALLOWED_SCOPES.has(input.scope)) {
      throw new Error(`Unknown storage scope: ${input.scope}`);
    }
    const ext = this.guessExtension(input.contentType, input.suggestedFilename);
    const id = randomBytes(16).toString('hex');
    const datePrefix = new Date().toISOString().slice(0, 10);
    const storageKey = `${input.scope}/${datePrefix}/${id}${ext}`;

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const sig = this.sign(storageKey, expiresAt.getTime());

    const uploadUrl = `${this.baseUrl}/${storageKey}?expires=${expiresAt.getTime()}&sig=${sig}`;

    return {
      storageKey,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      expiresAt: expiresAt.toISOString(),
      publicUrl: this.getPublicUrl(storageKey),
    };
  }

  async presignDownload(storageKey: string): Promise<string> {
    return this.getPublicUrl(storageKey);
  }

  getPublicUrl(storageKey: string): string {
    return `${this.baseUrl}/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = path.join(this.rootDir, storageKey);
    try {
      await fs.unlink(fullPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  verifyUploadSignature(storageKey: string, expires: number, sig: string) {
    if (!Number.isFinite(expires) || expires < Date.now()) return false;
    const expected = this.sign(storageKey, expires);
    return expected === sig;
  }

  async writeUploadedFile(storageKey: string, body: Buffer) {
    const fullPath = path.join(this.rootDir, storageKey);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, body);
  }

  async readFile(storageKey: string): Promise<Buffer> {
    const fullPath = path.join(this.rootDir, storageKey);
    return fs.readFile(fullPath);
  }

  private sign(storageKey: string, expires: number) {
    return createHmac('sha256', this.signingSecret)
      .update(`${storageKey}:${expires}`)
      .digest('hex');
  }

  private guessExtension(contentType: string, suggestedFilename?: string): string {
    if (suggestedFilename) {
      const m = suggestedFilename.match(/\.[a-z0-9]{1,5}$/i);
      if (m) return m[0].toLowerCase();
    }
    if (contentType === 'application/pdf') return '.pdf';
    if (contentType === 'image/png') return '.png';
    if (contentType === 'image/webp') return '.webp';
    if (contentType === 'image/jpeg') return '.jpg';
    return '.bin';
  }
}
