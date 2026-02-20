import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface SendMailInput {
  to: string;
  subject?: string;
  body: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(input: SendMailInput) {
    const provider = (process.env.MAIL_PROVIDER || 'log').toLowerCase();

    if (provider === 'webhook') {
      const url = process.env.MAIL_WEBHOOK_URL;
      if (!url) {
        throw new Error('MAIL_WEBHOOK_URL is required when MAIL_PROVIDER=webhook');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (process.env.MAIL_WEBHOOK_AUTH_TOKEN) {
        headers.Authorization = `Bearer ${process.env.MAIL_WEBHOOK_AUTH_TOKEN}`;
      }

      const response = await axios.post(
        url,
        {
          to: input.to,
          subject: input.subject,
          body: input.body,
        },
        { headers, timeout: 10000 },
      );

      return {
        provider: 'webhook',
        providerMessageId: String(response.data?.id || response.data?.messageId || Date.now()),
      };
    }

    this.logger.log(`[MAIL:LOG] to=${input.to} subject=${input.subject || ''} body=${input.body}`);
    return {
      provider: 'log',
      providerMessageId: `log-mail-${Date.now()}`,
    };
  }
}
