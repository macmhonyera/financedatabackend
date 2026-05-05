import { ConflictException } from '@nestjs/common';

export function readIfMatch(req: any): string | undefined {
  const raw = req?.headers?.['if-match'] ?? req?.headers?.['If-Match'];
  if (!raw) return undefined;
  return String(raw).replace(/^["']|["']$/g, '').trim() || undefined;
}

export function assertIfMatch(provided: string | undefined, currentUpdatedAt: Date | string | null | undefined, currentEntity?: unknown) {
  if (!provided) return;
  const current = currentUpdatedAt
    ? new Date(currentUpdatedAt as any).toISOString()
    : '';
  if (provided !== current) {
    throw new ConflictException({
      statusCode: 409,
      message: 'Resource has been modified since last fetch',
      currentUpdatedAt: current,
      current: currentEntity,
    });
  }
}
