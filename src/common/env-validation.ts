import { Logger } from '@nestjs/common';

const INSECURE_DEFAULTS = new Set(['replace_me_with_strong_secret', 'changeme', 'secret', '']);

export function validateEnv() {
  const env = process.env;
  const isProduction = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const jwtSecret = (env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required');
  } else if (isProduction && (INSECURE_DEFAULTS.has(jwtSecret) || jwtSecret.length < 32)) {
    errors.push('JWT_SECRET must be a strong secret (>=32 chars, not a default placeholder) in production');
  }

  if (isProduction) {
    const hasUrl = !!env.DATABASE_URL;
    const hasDiscrete =
      !!env.DATABASE_HOST && !!env.DATABASE_USER && !!env.DATABASE_PASSWORD && !!env.DATABASE_NAME;
    if (!hasUrl && !hasDiscrete) {
      errors.push(
        'DATABASE_URL (or DATABASE_HOST + DATABASE_USER + DATABASE_PASSWORD + DATABASE_NAME) must be set in production',
      );
    }

    const password = (env.DATABASE_PASSWORD || '').trim();
    if (!hasUrl && (password === 'password' || password === 'postgres')) {
      errors.push('DATABASE_PASSWORD must not be a default placeholder in production');
    }

    const aiEnabled = String(env.AI_RECOVERY_ENABLED || '').toLowerCase() === 'true';
    if (aiEnabled && !env.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY is required when AI_RECOVERY_ENABLED=true');
    }

    const whatsappProvider = String(env.WHATSAPP_PROVIDER || '').toLowerCase();
    if (whatsappProvider === 'twilio' && (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN)) {
      warnings.push('Twilio WhatsApp provider configured but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN missing');
    }
    if (whatsappProvider === 'meta' && (!env.WHATSAPP_META_ACCESS_TOKEN || !env.WHATSAPP_META_PHONE_NUMBER_ID)) {
      warnings.push('Meta WhatsApp provider configured but access token / phone number ID missing');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n  - ${errors.join('\n  - ')}`);
  }
  if (warnings.length > 0) {
    const logger = new Logger('EnvValidation');
    for (const w of warnings) logger.warn(w);
  }
}
