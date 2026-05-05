export type StorageScope = 'client-documents' | 'client-photos' | 'payment-receipts' | 'loan-signatures' | 'field-visits';

export type PresignedUpload = {
  storageKey: string;
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresAt: string;
  publicUrl: string;
};

export interface StorageProvider {
  presignUpload(input: {
    scope: StorageScope;
    contentType: string;
    sizeBytes: number;
    suggestedFilename?: string;
  }): Promise<PresignedUpload>;

  presignDownload(storageKey: string): Promise<string>;

  getPublicUrl(storageKey: string): string;

  delete(storageKey: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
