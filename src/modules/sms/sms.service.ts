import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface SendSmsInput {
  to: string;
  body: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async send(input: SendSmsInput) {
    const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();

    if (provider === 'twilio') {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM_NUMBER;

      if (!sid || !token || !from) {
        throw new Error('Twilio credentials are missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const body = new URLSearchParams({
        To: input.to,
        From: from,
        Body: input.body,
      });

      const response = await axios.post(url, body.toString(), {
        auth: { username: sid, password: token },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      });

      return {
        provider: 'twilio',
        providerMessageId: String(response.data?.sid || Date.now()),
      };
    }

    this.logger.log(`[SMS:LOG] to=${input.to} body=${input.body}`);
    return {
      provider: 'log',
      providerMessageId: `log-sms-${Date.now()}`,
    };
  }
}
