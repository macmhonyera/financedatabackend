import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Build the CORS configuration for both the local server and the Vercel
 * serverless handler. The two entrypoints used to copy/paste the same logic;
 * keep it here so they can't drift.
 *
 * Allowed origins (in order):
 *  - Anything in the comma-separated `CORS_ORIGINS` env var
 *  - The pinned production frontend on Vercel
 *  - Any `*.vercel.app` host (catches preview deployments without manual config)
 *  - localhost / 127.0.0.1 (dev)
 */
export const buildCorsOptions = (): CorsOptions => {
  const explicit = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const pinned = new Set<string>([
    'https://finance-custom-data.vercel.app',
    ...explicit,
  ]);

  const isAllowed = (origin: string): boolean => {
    if (pinned.has(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+(?:--[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return true;
    if (/^https?:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) return true;
    return false;
  };

  return {
    origin(origin, callback) {
      // Same-origin / server-to-server (no Origin header) — always allow.
      if (!origin) return callback(null, true);
      if (isAllowed(origin)) return callback(null, true);
      // Unknown origin: omit the Allow-Origin header (browser blocks) rather
      // than throwing — avoids noisy 500s on Vercel logs from bots / probes.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'Idempotency-Key', 'X-Requested-With'],
    exposedHeaders: ['ETag', 'Location'],
  };
};
