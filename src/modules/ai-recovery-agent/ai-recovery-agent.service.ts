import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { Client } from '../../entities/client.entity';
import { Loan } from '../../entities/loan.entity';
import { LoanInstallment } from '../../entities/loan-installment.entity';
import {
  BorrowerMessage,
  BorrowerMessageStatus,
  BorrowerMessageType,
} from '../../entities/borrower-message.entity';
import { PaymentPromise } from '../../entities/payment-promise.entity';
import {
  RecoveryAction,
  RecoveryActionStatus,
  RecoveryActionType,
  RecoveryRiskCategory,
} from '../../entities/recovery-action.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

type IncomingProvider = 'twilio' | 'meta';

type ParsedIncomingMessage = {
  provider: IncomingProvider;
  fromPhone: string;
  text: string;
  providerMessageId?: string;
  payload: Record<string, any>;
};

type MessageIntent =
  | 'promise_to_pay'
  | 'dispute'
  | 'partial_payment_intent'
  | 'ask_balance'
  | 'ask_due_date'
  | 'greeting'
  | 'other';

type LoanSnapshot = {
  loanId: string;
  currency: string;
  nextDueDate?: string;
  nextDueAmount: number;
  overdueDays: number;
  overdueInstallments: number;
  missedPayments: number;
};

type BorrowerFinancialContext = {
  borrowerId: string;
  borrowerName: string;
  borrowerPhone?: string;
  branchId?: string;
  outstandingBalance: number;
  currency: string;
  nextPaymentDate?: string;
  overdueDays: number;
  overdueStatus: boolean;
  missedPayments: number;
  ignoredReminders: number;
  brokenPromises: number;
  riskScore: number;
  riskCategory: RecoveryRiskCategory;
  primaryLoanId?: string;
  repaymentSchedule: Array<{
    installmentNumber: number;
    dueDate: string;
    status: string;
    amountDue: number;
    outstandingDue: number;
  }>;
};

type ReminderStage = {
  actionType: RecoveryActionType;
  messageType: BorrowerMessageType;
  title: string;
  dueDate?: string;
  dueAmount: number;
  overdueDays: number;
};

type ReminderSweepSummary = {
  evaluatedLoans: number;
  remindersSent: number;
  escalations: number;
  failures: number;
  skipped: number;
};

type InterpretResult = {
  intent: MessageIntent;
  amount?: number;
  promiseDate?: string;
};

@Injectable()
export class AiRecoveryAgentService {
  private readonly logger = new Logger(AiRecoveryAgentService.name);
  private readonly webhookRateTracker = new Map<string, number[]>();

  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
    @InjectRepository(LoanInstallment)
    private readonly installmentRepo: Repository<LoanInstallment>,
    @InjectRepository(BorrowerMessage)
    private readonly messageRepo: Repository<BorrowerMessage>,
    @InjectRepository(PaymentPromise)
    private readonly promiseRepo: Repository<PaymentPromise>,
    @InjectRepository(RecoveryAction)
    private readonly actionRepo: Repository<RecoveryAction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  private round2(value: number) {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  private asDateOnly(input: Date) {
    return input.toISOString().slice(0, 10);
  }

  private parseDateOnly(input?: string) {
    if (!input) return null;
    const parsed = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private sanitizeText(input: any, maxLength = 1200) {
    const cleaned = String(input || '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, maxLength);
  }

  private normalizePhone(input: string) {
    let digits = String(input || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits;
  }

  private formatAmount(amount: number, currency = 'USD') {
    const safe = this.round2(Number(amount || 0));
    return `${currency.toUpperCase()} ${safe.toFixed(2)}`;
  }

  private getOutgoingWhatsappPhone(input: string) {
    const raw = String(input || '').trim();
    if (raw.startsWith('whatsapp:')) return raw;

    if (raw.startsWith('+')) return `whatsapp:${raw}`;

    let digits = this.normalizePhone(raw);
    if (!digits) return '';

    if (digits.startsWith('0')) {
      const defaultCountryCode =
        String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '+263').replace(/\D/g, '') || '263';
      digits = `${defaultCountryCode}${digits.slice(1)}`;
    }

    return `whatsapp:+${digits}`;
  }

  private getRequestUrl(req: any) {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req?.protocol || 'https';
    const host =
      String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim() ||
      req?.get?.('host') ||
      req?.headers?.host;
    const path = String(req?.originalUrl || req?.url || '').split('?')[0];
    return `${protocol}://${host}${path}`;
  }

  private timingSafeEqual(a: string, b: string) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  }

  private verifyTwilioSignature(url: string, payload: Record<string, any>, signature: string, token: string) {
    const sortedKeys = Object.keys(payload || {}).sort();
    const data = sortedKeys.reduce((acc, key) => {
      const value = Array.isArray(payload[key]) ? payload[key].join('') : payload[key];
      return `${acc}${key}${value ?? ''}`;
    }, url);

    const expected = crypto.createHmac('sha1', token).update(data).digest('base64');
    return this.timingSafeEqual(signature, expected);
  }

  private verifyMetaSignature(payload: Record<string, any>, signature: string, appSecret: string) {
    const expected = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(JSON.stringify(payload || {}))
      .digest('hex')}`;
    return this.timingSafeEqual(signature, expected);
  }

  private assertWebhookRateLimit(key: string) {
    const maxRequests = Math.max(1, Number(process.env.WHATSAPP_RATE_LIMIT_MAX_REQUESTS || 20));
    const windowMs = Math.max(1000, Number(process.env.WHATSAPP_RATE_LIMIT_WINDOW_MS || 60000));
    const now = Date.now();

    const bucket = (this.webhookRateTracker.get(key) || []).filter((ts) => now - ts < windowMs);
    if (bucket.length >= maxRequests) {
      throw new HttpException('Rate limit exceeded for webhook sender', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.push(now);
    this.webhookRateTracker.set(key, bucket);
  }

  parseIncomingWebhookMessage(body: any): ParsedIncomingMessage | null {
    if (body && typeof body.From === 'string' && typeof body.Body === 'string') {
      return {
        provider: 'twilio',
        fromPhone: this.sanitizeText(String(body.From).replace(/^whatsapp:/i, ''), 40),
        text: this.sanitizeText(body.Body),
        providerMessageId: this.sanitizeText(body.MessageSid || body.SmsMessageSid, 100),
        payload: body,
      };
    }

    const metaMessage = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (metaMessage) {
      const bodyText =
        metaMessage?.text?.body ||
        metaMessage?.interactive?.button_reply?.title ||
        metaMessage?.button?.text ||
        '';

      if (bodyText) {
        return {
          provider: 'meta',
          fromPhone: this.sanitizeText(`+${metaMessage.from || ''}`, 40),
          text: this.sanitizeText(bodyText),
          providerMessageId: this.sanitizeText(metaMessage.id, 100),
          payload: body,
        };
      }
    }

    return null;
  }

  validateWebhookRequest(req: any, body: any) {
    const isTwilioPayload = body && typeof body.From === 'string' && typeof body.Body === 'string';
    const twilioToken =
      process.env.TWILIO_WHATSAPP_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';
    const twilioSignature = String(req?.headers?.['x-twilio-signature'] || '');

    if (isTwilioPayload) {
      const enforceTwilio = process.env.WHATSAPP_VALIDATE_TWILIO_SIGNATURE !== 'false';
      if (enforceTwilio && twilioToken) {
        const url = process.env.WHATSAPP_WEBHOOK_URL || this.getRequestUrl(req);
        const valid = this.verifyTwilioSignature(url, body, twilioSignature, twilioToken);
        if (!valid) {
          throw new UnauthorizedException('Invalid Twilio webhook signature');
        }
      } else if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Twilio webhook validation is required in production');
      }
      return true;
    }

    const hasMetaPayload = Boolean(body?.entry?.[0]?.changes?.[0]?.value);
    if (hasMetaPayload) {
      const verifyToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
      if (verifyToken) {
        const provided = String(req?.headers?.['x-webhook-token'] || req?.query?.token || '');
        if (!provided || provided !== verifyToken) {
          throw new UnauthorizedException('Invalid webhook token');
        }
      }

      const signature = String(req?.headers?.['x-hub-signature-256'] || '');
      const appSecret = process.env.WHATSAPP_META_APP_SECRET;
      if (signature && appSecret) {
        const valid = this.verifyMetaSignature(body, signature, appSecret);
        if (!valid) {
          throw new UnauthorizedException('Invalid Meta webhook signature');
        }
      }

      if (process.env.NODE_ENV === 'production' && !verifyToken && !signature) {
        throw new UnauthorizedException('Webhook request validation is required in production');
      }

      return true;
    }

    throw new BadRequestException('Unsupported webhook payload');
  }

  validateWebhookChallenge(query: Record<string, any>) {
    const mode = String(query?.['hub.mode'] || '');
    const token = String(query?.['hub.verify_token'] || '');
    const challenge = String(query?.['hub.challenge'] || '');

    if (!mode || !token || !challenge) {
      throw new BadRequestException('Invalid webhook verification payload');
    }

    const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Webhook verification failed');
    }

    return challenge;
  }

  private getInstallmentOutstanding(installment: LoanInstallment) {
    const paid =
      Number(installment.principalPaid || 0) +
      Number(installment.interestPaid || 0) +
      Number(installment.feePaid || 0) +
      Number(installment.penaltyPaid || 0);
    const totalDue = Number(installment.totalDue || 0);
    return this.round2(Math.max(0, totalDue - paid));
  }

  private buildLoanSnapshot(loan: Loan, asOfDate: Date): LoanSnapshot {
    const installments = Array.isArray(loan.installments) ? [...loan.installments] : [];
    const unpaid = installments
      .filter((row) => row.status !== 'paid')
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

    const next = unpaid[0];
    const nextDueDate = next?.dueDate;
    const nextDueAmount = next ? this.getInstallmentOutstanding(next) : 0;

    let overdueDays = 0;
    let overdueInstallments = 0;

    for (const row of unpaid) {
      const due = this.parseDateOnly(row.dueDate);
      if (!due || due > asOfDate) continue;
      overdueInstallments += 1;
      const days = Math.floor((asOfDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (days > overdueDays) overdueDays = days;
    }

    return {
      loanId: loan.id,
      currency: loan.currency || 'USD',
      nextDueDate,
      nextDueAmount,
      overdueDays,
      overdueInstallments,
      missedPayments: overdueInstallments,
    };
  }

  private resolvePrimarySnapshot(snapshots: LoanSnapshot[]) {
    if (snapshots.length === 0) return null;

    const sorted = [...snapshots].sort((a, b) => {
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
      if (a.nextDueDate && b.nextDueDate) return String(a.nextDueDate).localeCompare(String(b.nextDueDate));
      if (a.nextDueDate && !b.nextDueDate) return -1;
      if (!a.nextDueDate && b.nextDueDate) return 1;
      return 0;
    });

    return sorted[0];
  }

  private async updateBrokenPromises(borrowerId: string, asOfDate: Date) {
    const today = this.asDateOnly(asOfDate);
    const openPromises = await this.promiseRepo.find({
      where: {
        borrower: { id: borrowerId } as any,
        status: 'open',
        promisedDate: Not(IsNull()) as any,
      },
    });

    const toBreak = openPromises.filter((row) => row.promisedDate && row.promisedDate < today);
    if (toBreak.length === 0) return;

    for (const row of toBreak) {
      row.status = 'broken';
      row.resolvedAt = asOfDate;
    }

    await this.promiseRepo.save(toBreak);
  }

  private async countIgnoredReminders(borrowerId: string, asOfDate: Date) {
    const from = new Date(asOfDate);
    from.setDate(from.getDate() - 14);

    const messages = await this.messageRepo.find({
      where: {
        borrower: { id: borrowerId } as any,
        timestamp: Between(from, asOfDate) as any,
      },
      order: { timestamp: 'ASC' },
    });

    const outboundReminders = messages.filter(
      (row) =>
        row.direction === 'outbound' &&
        ['upcoming_reminder', 'due_today_reminder', 'overdue_notice'].includes(row.messageType),
    );

    const inbound = messages.filter((row) => row.direction === 'inbound');

    let ignored = 0;
    for (const reminder of outboundReminders) {
      const after = inbound.some((message) => {
        const delta = message.timestamp.getTime() - reminder.timestamp.getTime();
        return delta >= 0 && delta <= 1000 * 60 * 60 * 48;
      });
      if (!after) ignored += 1;
    }

    return ignored;
  }

  private computeRiskScore(input: {
    overdueDays: number;
    missedPayments: number;
    ignoredReminders: number;
    brokenPromises: number;
  }) {
    const daysScore = Math.min(45, Math.max(0, input.overdueDays) * 3);
    const missedScore = Math.min(25, Math.max(0, input.missedPayments) * 7);
    const ignoredScore = Math.min(20, Math.max(0, input.ignoredReminders) * 8);
    const brokenScore = Math.min(25, Math.max(0, input.brokenPromises) * 12);

    const score = Math.min(100, daysScore + missedScore + ignoredScore + brokenScore);
    const category: RecoveryRiskCategory = score >= 65 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

    return {
      score,
      category,
      components: {
        daysScore,
        missedScore,
        ignoredScore,
        brokenScore,
      },
    };
  }

  async buildBorrowerFinancialContext(
    borrowerId: string,
    preferredLoanId?: string,
  ): Promise<BorrowerFinancialContext> {
    const borrower = await this.clientRepo.findOne({
      where: { id: borrowerId },
      relations: ['branch'],
    });

    if (!borrower) throw new NotFoundException('Borrower not found');

    const asOfDate = new Date();
    await this.updateBrokenPromises(borrowerId, asOfDate);

    const loans = await this.loanRepo.find({
      where: {
        client: { id: borrowerId } as any,
        status: In(['active', 'overdue', 'defaulted']) as any,
      },
      relations: ['installments'],
      order: { createdAt: 'DESC' },
    });

    const snapshots = loans.map((loan) => this.buildLoanSnapshot(loan, asOfDate));
    const primarySnapshot =
      snapshots.find((snapshot) => snapshot.loanId === preferredLoanId) ||
      this.resolvePrimarySnapshot(snapshots);

    const outstandingBalance = this.round2(
      loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0),
    );

    const nextPaymentDate = snapshots
      .filter((snapshot) => snapshot.nextDueDate)
      .map((snapshot) => String(snapshot.nextDueDate))
      .sort()[0];

    const overdueDays = Math.max(0, ...snapshots.map((snapshot) => snapshot.overdueDays), 0);
    const missedPayments = snapshots.reduce((sum, snapshot) => sum + snapshot.missedPayments, 0);

    const brokenPromises = await this.promiseRepo.count({
      where: {
        borrower: { id: borrowerId } as any,
        status: 'broken' as any,
      },
    });

    const ignoredReminders = await this.countIgnoredReminders(borrowerId, asOfDate);

    const risk = this.computeRiskScore({
      overdueDays,
      missedPayments,
      ignoredReminders,
      brokenPromises,
    });

    const primaryLoan = loans.find((loan) => loan.id === primarySnapshot?.loanId) || loans[0];
    const repaymentSchedule = (primaryLoan?.installments || [])
      .filter((installment) => installment.status !== 'paid')
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 6)
      .map((installment) => ({
        installmentNumber: Number(installment.installmentNumber || 0),
        dueDate: installment.dueDate,
        status: installment.status,
        amountDue: Number(installment.totalDue || 0),
        outstandingDue: this.getInstallmentOutstanding(installment),
      }));

    return {
      borrowerId,
      borrowerName: borrower.name,
      borrowerPhone: borrower.phone,
      branchId: (borrower.branch as any)?.id,
      outstandingBalance,
      currency: primarySnapshot?.currency || primaryLoan?.currency || 'USD',
      nextPaymentDate,
      overdueDays,
      overdueStatus: overdueDays > 0,
      missedPayments,
      ignoredReminders,
      brokenPromises,
      riskScore: risk.score,
      riskCategory: risk.category,
      primaryLoanId: primarySnapshot?.loanId,
      repaymentSchedule,
    };
  }

  private parseDateFromText(text: string) {
    const lower = text.toLowerCase();
    const now = new Date();

    if (lower.includes('tomorrow')) {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      return this.asDateOnly(date);
    }

    if (lower.includes('next week')) {
      const date = new Date(now);
      date.setDate(date.getDate() + 7);
      return this.asDateOnly(date);
    }

    if (lower.includes('today')) {
      return this.asDateOnly(now);
    }

    const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso?.[1]) return iso[1];

    const slashDate = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (slashDate) {
      const day = Number(slashDate[1]);
      const month = Number(slashDate[2]);
      const year = slashDate[3]
        ? Number(slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3])
        : now.getUTCFullYear();

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(Date.UTC(year, month - 1, day));
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString().slice(0, 10);
        }
      }
    }

    return undefined;
  }

  private parseAmountFromText(text: string) {
    const matched = text.match(/(?:\$|usd|zig)?\s*(\d+(?:\.\d{1,2})?)/i);
    if (!matched?.[1]) return undefined;
    const amount = Number(matched[1]);
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    return this.round2(amount);
  }

  interpretBorrowerMessage(rawText: string): InterpretResult {
    const text = this.sanitizeText(rawText).toLowerCase();

    const amount = this.parseAmountFromText(text);
    const promiseDate = this.parseDateFromText(text);

    if (
      /(dispute|wrong|incorrect|error|already paid|not my loan|fraud|scam)/i.test(text)
    ) {
      return { intent: 'dispute' };
    }

    if (/(partial|half|part payment|small amount|installment only)/i.test(text)) {
      return { intent: 'partial_payment_intent', amount, promiseDate };
    }

    if (/(promise|i will pay|i can pay|pay by|pay on|pay tomorrow|pay today)/i.test(text)) {
      return { intent: 'promise_to_pay', amount, promiseDate };
    }

    if (/(how much|amount due|balance|owe|outstanding)/i.test(text)) {
      return { intent: 'ask_balance' };
    }

    if (/(due date|when is .*due|when .*payment due|next payment)/i.test(text)) {
      return { intent: 'ask_due_date' };
    }

    if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
      return { intent: 'greeting' };
    }

    return { intent: 'other' };
  }

  private mapIntentToMessageType(intent: MessageIntent): BorrowerMessageType {
    if (intent === 'promise_to_pay') return 'promise_to_pay';
    if (intent === 'dispute') return 'dispute';
    if (intent === 'partial_payment_intent') return 'partial_payment_intent';
    return 'incoming_query';
  }

  private buildFallbackReply(intent: MessageIntent, context: BorrowerFinancialContext) {
    const outstanding = this.formatAmount(context.outstandingBalance, context.currency);
    const nextDue = context.nextPaymentDate || 'N/A';

    if (intent === 'ask_balance') {
      return `You currently have an outstanding balance of ${outstanding}. Your next payment date is ${nextDue}.`;
    }

    if (intent === 'ask_due_date') {
      return `Your next payment date is ${nextDue}. Outstanding balance is ${outstanding}.`;
    }

    if (intent === 'promise_to_pay') {
      return `Thank you. I have recorded your promise to pay. Your outstanding balance is ${outstanding}.`;
    }

    if (intent === 'partial_payment_intent') {
      return `Thanks for the update. A partial payment can be arranged, and we have recorded your intent.`;
    }

    if (intent === 'dispute') {
      return 'Thanks for flagging this. We have raised your dispute for review and a staff member will follow up.';
    }

    return `I can help with your loan account. Your outstanding balance is ${outstanding}, and your next payment date is ${nextDue}.`;
  }

  private async buildConversationSnippet(borrowerId: string, loanId?: string) {
    const qb = this.messageRepo
      .createQueryBuilder('message')
      .where('message.borrower_id = :borrowerId', { borrowerId })
      .orderBy('message.timestamp', 'DESC')
      .take(8);

    if (loanId) qb.andWhere('(message.loan_id = :loanId OR message.loan_id IS NULL)', { loanId });

    const messages = await qb.getMany();

    return messages
      .reverse()
      .map((row) => {
        const direction = row.direction === 'inbound' ? 'BORROWER' : 'AGENT';
        return `${direction}: ${this.sanitizeText(row.messageContent, 180)}`;
      })
      .join('\n');
  }

  private async generateLlmReply(
    userMessage: string,
    intent: MessageIntent,
    context: BorrowerFinancialContext,
    history: string,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const baseUrl = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

    const repaymentSchedule = context.repaymentSchedule
      .map((row) => `${row.installmentNumber}. ${row.dueDate} | ${context.currency} ${row.outstandingDue.toFixed(2)} | ${row.status}`)
      .join('\n');

    const prompt = [
      'You are an AI WhatsApp payment recovery assistant for a loan company.',
      'Respond in a concise, empathetic, and professional tone (1-3 short sentences).',
      'Do not reveal internal IDs, secrets, or implementation details.',
      `Borrower name: ${context.borrowerName}`,
      `Outstanding balance: ${context.currency} ${context.outstandingBalance.toFixed(2)}`,
      `Next payment date: ${context.nextPaymentDate || 'N/A'}`,
      `Overdue status: ${context.overdueStatus ? `OVERDUE (${context.overdueDays} days)` : 'NOT OVERDUE'}`,
      `Repayment schedule:\n${repaymentSchedule || 'No pending installments.'}`,
      `Detected intent: ${intent}`,
      `Recent conversation:\n${history || 'No prior conversation.'}`,
      `Borrower message: ${this.sanitizeText(userMessage, 500)}`,
      'If borrower asks balance, include exact outstanding balance and next payment date.',
      'If borrower disputes, acknowledge and confirm escalation to staff.',
      'If borrower promises payment, acknowledge and encourage prompt payment.',
    ].join('\n');

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          temperature: 0.2,
          max_tokens: 180,
          messages: [
            {
              role: 'system',
              content: 'You are a financial payment recovery assistant for WhatsApp.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        },
      );

      const content = this.sanitizeText(response.data?.choices?.[0]?.message?.content || '', 900);
      if (!content) return null;

      return content;
    } catch (error: any) {
      this.logger.warn(`LLM response generation failed: ${error?.message || error}`);
      return null;
    }
  }

  private async sendWhatsAppMessage(
    destinationPhone: string,
    message: string,
    preferredProvider?: IncomingProvider,
  ) {
    const provider = String(process.env.WHATSAPP_PROVIDER || preferredProvider || 'twilio').toLowerCase();
    const text = this.sanitizeText(message, 900);

    if (!text) {
      throw new BadRequestException('Cannot send an empty WhatsApp message');
    }

    if (provider === 'meta') {
      const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) {
        throw new Error(
          'Meta WhatsApp credentials missing (WHATSAPP_META_ACCESS_TOKEN, WHATSAPP_META_PHONE_NUMBER_ID)',
        );
      }

      const to = this.normalizePhone(destinationPhone);
      if (!to) throw new Error('Invalid destination phone for WhatsApp message');

      const response = await axios.post(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        },
      );

      return {
        provider: 'meta',
        providerMessageId: String(response.data?.messages?.[0]?.id || Date.now()),
      };
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.WHATSAPP_TWILIO_FROM || process.env.TWILIO_WHATSAPP_FROM;

    if (!sid || !token || !from) {
      throw new Error(
        'Twilio WhatsApp credentials missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, WHATSAPP_TWILIO_FROM)',
      );
    }

    const to = this.getOutgoingWhatsappPhone(destinationPhone);
    const fromPhone = this.getOutgoingWhatsappPhone(from);

    if (!to || !fromPhone) {
      throw new Error('Invalid Twilio WhatsApp phone configuration');
    }

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      new URLSearchParams({
        To: to,
        From: fromPhone,
        Body: text,
      }).toString(),
      {
        auth: { username: sid, password: token },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 12000,
      },
    );

    return {
      provider: 'twilio',
      providerMessageId: String(response.data?.sid || Date.now()),
    };
  }

  private async createRecoveryAction(input: {
    borrowerId: string;
    loanId?: string;
    messageId?: string;
    actionType: RecoveryActionType;
    status?: RecoveryActionStatus;
    riskScore: number;
    riskCategory: RecoveryRiskCategory;
    details?: Record<string, any>;
    scheduledFor?: Date;
    executedAt?: Date;
  }) {
    const row = this.actionRepo.create({
      borrower: { id: input.borrowerId } as any,
      loan: input.loanId ? ({ id: input.loanId } as any) : undefined,
      message: input.messageId ? ({ id: input.messageId } as any) : undefined,
      actionType: input.actionType,
      status: input.status || 'completed',
      riskScore: input.riskScore,
      riskCategory: input.riskCategory,
      details: input.details,
      scheduledFor: input.scheduledFor,
      executedAt: input.executedAt || new Date(),
    } as RecoveryAction);

    return this.actionRepo.save(row);
  }

  private async notifyStaffEscalation(context: BorrowerFinancialContext, reason: string) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.branch', 'branch')
      .where('user.role IN (:...roles)', { roles: ['admin', 'manager'] });

    if (context.branchId) {
      qb.andWhere('(user.role = :adminRole OR branch.id = :branchId)', {
        adminRole: 'admin',
        branchId: context.branchId,
      });
    }

    const staff = await qb.getMany();

    for (const member of staff) {
      try {
        await this.notifications.enqueue({
          channel: 'in_app',
          recipientId: member.id,
          recipientAddress: member.email || `user:${member.id}`,
          message: `Recovery escalation: ${context.borrowerName} is ${context.overdueDays} day(s) overdue. ${reason}`,
          payload: {
            borrowerId: context.borrowerId,
            loanId: context.primaryLoanId,
            riskScore: context.riskScore,
            riskCategory: context.riskCategory,
          },
          maxAttempts: 1,
        } as any);
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue escalation notification: ${err?.message || err}`);
      }
    }
  }

  private async findBorrowerByPhone(rawPhone: string) {
    const normalizedIncoming = this.normalizePhone(rawPhone);
    if (!normalizedIncoming) return null;

    const clients = await this.clientRepo.find({
      where: { phone: Not(IsNull()) as any },
      relations: ['branch'],
    });

    let best: Client | null = null;
    let bestScore = -1;

    for (const client of clients) {
      const normalizedStored = this.normalizePhone(client.phone || '');
      if (!normalizedStored) continue;

      const exactMatch = normalizedStored === normalizedIncoming;
      const tailMatch =
        normalizedStored.endsWith(normalizedIncoming) || normalizedIncoming.endsWith(normalizedStored);
      if (!exactMatch && !tailMatch) continue;

      const score = exactMatch ? 1000 + normalizedStored.length : normalizedStored.length;
      if (score > bestScore) {
        best = client;
        bestScore = score;
      }
    }

    return best;
  }

  private ensureScopeForBorrower(user: any, borrower: Client) {
    if (!user || user.role === 'admin') return;

    const branchId = (borrower.branch as any)?.id;
    if (!branchId || branchId !== user.branch) {
      throw new ForbiddenException('You are not allowed to access this borrower');
    }
  }

  private async maybeRecordIntentArtifacts(input: {
    borrowerId: string;
    loanId?: string;
    messageId: string;
    intentData: InterpretResult;
    context: BorrowerFinancialContext;
    messageText: string;
  }) {
    const { borrowerId, loanId, messageId, intentData, context, messageText } = input;

    if (intentData.intent === 'promise_to_pay') {
      await this.promiseRepo.save(
        this.promiseRepo.create({
          borrower: { id: borrowerId } as any,
          loan: loanId ? ({ id: loanId } as any) : undefined,
          sourceMessage: { id: messageId } as any,
          promisedAmount: intentData.amount,
          promisedDate: intentData.promiseDate,
          status: 'open',
          notes: this.sanitizeText(messageText, 400),
        } as PaymentPromise),
      );

      await this.createRecoveryAction({
        borrowerId,
        loanId,
        messageId,
        actionType: 'promise_followup',
        status: 'pending',
        riskScore: context.riskScore,
        riskCategory: context.riskCategory,
        details: {
          promisedAmount: intentData.amount,
          promisedDate: intentData.promiseDate,
        },
      });
      return;
    }

    if (intentData.intent === 'partial_payment_intent') {
      await this.createRecoveryAction({
        borrowerId,
        loanId,
        messageId,
        actionType: 'borrower_response',
        status: 'pending',
        riskScore: context.riskScore,
        riskCategory: context.riskCategory,
        details: {
          type: 'partial_payment_intent',
          statedAmount: intentData.amount,
          targetDate: intentData.promiseDate,
          borrowerMessage: this.sanitizeText(messageText, 300),
        },
      });
      return;
    }

    if (intentData.intent === 'dispute') {
      await this.createRecoveryAction({
        borrowerId,
        loanId,
        messageId,
        actionType: 'escalation',
        status: 'escalated',
        riskScore: context.riskScore,
        riskCategory: context.riskCategory,
        details: {
          reason: 'borrower_dispute',
          borrowerMessage: this.sanitizeText(messageText, 300),
        },
      });

      await this.notifyStaffEscalation(context, 'Borrower raised a payment dispute via WhatsApp.');
    }
  }

  private async maybeEscalateHighRisk(context: BorrowerFinancialContext, trigger: string, messageId?: string) {
    if (context.riskCategory !== 'HIGH' || context.overdueDays < 7) return;

    const existingEscalation = await this.actionRepo.count({
      where: {
        borrower: { id: context.borrowerId } as any,
        loan: context.primaryLoanId ? ({ id: context.primaryLoanId } as any) : undefined,
        actionType: 'escalation' as any,
        createdAt: Between(
          new Date(Date.now() - 1000 * 60 * 60 * 24),
          new Date(),
        ) as any,
      },
    });

    if (existingEscalation > 0) return;

    await this.createRecoveryAction({
      borrowerId: context.borrowerId,
      loanId: context.primaryLoanId,
      messageId,
      actionType: 'escalation',
      status: 'escalated',
      riskScore: context.riskScore,
      riskCategory: context.riskCategory,
      details: {
        reason: trigger,
        overdueDays: context.overdueDays,
      },
    });

    await this.notifyStaffEscalation(
      context,
      `Risk score ${context.riskScore} (${context.riskCategory}) triggered automatic escalation.`,
    );
  }

  async handleIncomingMessage(parsed: ParsedIncomingMessage, borrower: Client) {
    const dedupeKey = parsed.providerMessageId;
    if (dedupeKey) {
      const existing = await this.messageRepo.findOne({
        where: {
          providerMessageId: dedupeKey,
          direction: 'inbound' as any,
          borrower: { id: borrower.id } as any,
        },
      });

      if (existing?.aiResponse) {
        return {
          reply: existing.aiResponse,
          borrowerId: borrower.id,
          loanId: existing.loanId,
          riskCategory: undefined,
        };
      }
    }

    const context = await this.buildBorrowerFinancialContext(borrower.id);
    const interpreted = this.interpretBorrowerMessage(parsed.text);

    const inboundEntity = this.messageRepo.create({
      borrower: { id: borrower.id } as any,
      loan: context.primaryLoanId ? ({ id: context.primaryLoanId } as any) : undefined,
      channel: 'whatsapp',
      direction: 'inbound',
      messageType: this.mapIntentToMessageType(interpreted.intent),
      messageContent: parsed.text,
      providerMessageId: parsed.providerMessageId || undefined,
      status: 'processed' as BorrowerMessageStatus,
      metadata: {
        provider: parsed.provider,
      },
    } as any) as unknown as BorrowerMessage;

    const inbound = await this.messageRepo.save(inboundEntity);

    await this.maybeRecordIntentArtifacts({
      borrowerId: borrower.id,
      loanId: context.primaryLoanId,
      messageId: inbound.id,
      intentData: interpreted,
      context,
      messageText: parsed.text,
    });

    const history = await this.buildConversationSnippet(borrower.id, context.primaryLoanId);
    const llmReply = await this.generateLlmReply(parsed.text, interpreted.intent, context, history);
    const reply = llmReply || this.buildFallbackReply(interpreted.intent, context);

    let outboundProviderMessageId: string | undefined;
    let outboundStatus: BorrowerMessageStatus = 'responded';

    try {
      const sent = await this.sendWhatsAppMessage(parsed.fromPhone, reply, parsed.provider);
      outboundProviderMessageId = sent.providerMessageId;
    } catch (error: any) {
      outboundStatus = 'failed';
      this.logger.warn(`Failed to send WhatsApp reply: ${error?.message || error}`);
    }

    inbound.aiResponse = reply;
    inbound.status = outboundStatus === 'failed' ? 'failed' : 'responded';
    await this.messageRepo.save(inbound);

    const outboundEntity = this.messageRepo.create({
      borrower: { id: borrower.id } as any,
      loan: context.primaryLoanId ? ({ id: context.primaryLoanId } as any) : undefined,
      channel: 'whatsapp',
      direction: 'outbound',
      messageType: 'general_response',
      messageContent: reply,
      providerMessageId: outboundProviderMessageId,
      status: outboundStatus,
      metadata: {
        provider: parsed.provider,
        inReplyTo: inbound.id,
      },
    } as any) as unknown as BorrowerMessage;

    const outbound = await this.messageRepo.save(outboundEntity);

    await this.createRecoveryAction({
      borrowerId: borrower.id,
      loanId: context.primaryLoanId,
      messageId: outbound.id,
      actionType: 'borrower_response',
      status: outboundStatus === 'failed' ? 'failed' : 'completed',
      riskScore: context.riskScore,
      riskCategory: context.riskCategory,
      details: {
        intent: interpreted.intent,
      },
    });

    await this.maybeEscalateHighRisk(context, 'high_risk_incoming_message', outbound.id);

    return {
      reply,
      borrowerId: borrower.id,
      loanId: context.primaryLoanId,
      riskCategory: context.riskCategory,
    };
  }

  async handleWebhookMessage(req: any, body: any) {
    this.validateWebhookRequest(req, body);
    const parsed = this.parseIncomingWebhookMessage(body);

    if (!parsed) {
      return {
        handled: false,
        reason: 'No supported inbound message detected',
      };
    }

    const rateKey = `${parsed.provider}:${this.normalizePhone(parsed.fromPhone)}`;
    this.assertWebhookRateLimit(rateKey);

    const borrower = await this.findBorrowerByPhone(parsed.fromPhone);
    if (!borrower) {
      const reply = 'We could not match your number to a borrower profile. Please contact support with your registered phone number.';
      try {
        await this.sendWhatsAppMessage(parsed.fromPhone, reply, parsed.provider);
      } catch (_error) {
        // no-op: still return webhook success to avoid provider retries storm
      }

      return {
        handled: true,
        borrowerFound: false,
        reply,
      };
    }

    const result = await this.handleIncomingMessage(parsed, borrower);

    return {
      handled: true,
      borrowerFound: true,
      reply: result.reply,
      borrowerId: result.borrowerId,
      loanId: result.loanId,
      riskCategory: result.riskCategory,
    };
  }

  private selectReminderStage(snapshot: LoanSnapshot, asOfDate: Date): ReminderStage | null {
    const today = this.asDateOnly(asOfDate);
    const plusTwo = new Date(asOfDate);
    plusTwo.setDate(plusTwo.getDate() + 2);
    const twoDaysAhead = this.asDateOnly(plusTwo);

    if (snapshot.overdueDays >= 7) {
      return {
        actionType: 'escalation',
        messageType: 'escalation',
        title: 'Escalation reminder',
        dueDate: snapshot.nextDueDate,
        dueAmount: snapshot.nextDueAmount,
        overdueDays: snapshot.overdueDays,
      };
    }

    if (snapshot.overdueDays >= 1) {
      return {
        actionType: 'overdue_notice',
        messageType: 'overdue_notice',
        title: 'Overdue notice',
        dueDate: snapshot.nextDueDate,
        dueAmount: snapshot.nextDueAmount,
        overdueDays: snapshot.overdueDays,
      };
    }

    if (snapshot.nextDueDate === today) {
      return {
        actionType: 'due_today_reminder',
        messageType: 'due_today_reminder',
        title: 'Due today reminder',
        dueDate: snapshot.nextDueDate,
        dueAmount: snapshot.nextDueAmount,
        overdueDays: snapshot.overdueDays,
      };
    }

    if (snapshot.nextDueDate === twoDaysAhead) {
      return {
        actionType: 'upcoming_payment_reminder',
        messageType: 'upcoming_reminder',
        title: 'Upcoming payment reminder',
        dueDate: snapshot.nextDueDate,
        dueAmount: snapshot.nextDueAmount,
        overdueDays: snapshot.overdueDays,
      };
    }

    return null;
  }

  private buildReminderMessage(context: BorrowerFinancialContext, stage: ReminderStage) {
    const amount = this.formatAmount(stage.dueAmount || context.outstandingBalance, context.currency);

    if (stage.actionType === 'upcoming_payment_reminder') {
      return `Hello ${context.borrowerName}, this is a reminder that your payment of ${amount} is due on ${stage.dueDate}.`;
    }

    if (stage.actionType === 'due_today_reminder') {
      return `Hello ${context.borrowerName}, your payment of ${amount} is due today (${stage.dueDate}). Please pay to avoid overdue penalties.`;
    }

    if (stage.actionType === 'overdue_notice') {
      return `Hello ${context.borrowerName}, your payment is overdue by ${stage.overdueDays} day(s). Outstanding amount is ${amount}. Please settle as soon as possible.`;
    }

    return `Hello ${context.borrowerName}, your account is ${stage.overdueDays} day(s) overdue and has been escalated for follow-up. Outstanding amount is ${amount}.`;
  }

  private async hasActionForDate(
    borrowerId: string,
    loanId: string,
    actionType: RecoveryActionType,
    asOfDate: Date,
  ) {
    const start = new Date(asOfDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(asOfDate);
    end.setUTCHours(23, 59, 59, 999);

    const count = await this.actionRepo.count({
      where: {
        borrower: { id: borrowerId } as any,
        loan: { id: loanId } as any,
        actionType: actionType as any,
        createdAt: Between(start, end) as any,
      },
    });

    return count > 0;
  }

  async runDailyReminderSweep(asOfDate: Date = new Date()): Promise<ReminderSweepSummary> {
    const loans = await this.loanRepo.find({
      where: {
        status: In(['active', 'overdue', 'defaulted']) as any,
      },
      relations: ['client', 'client.branch', 'installments'],
      order: { createdAt: 'DESC' },
    });

    const summary: ReminderSweepSummary = {
      evaluatedLoans: loans.length,
      remindersSent: 0,
      escalations: 0,
      failures: 0,
      skipped: 0,
    };

    for (const loan of loans) {
      const borrower = loan.client;
      if (!borrower?.phone) {
        summary.skipped += 1;
        continue;
      }

      const snapshot = this.buildLoanSnapshot(loan, asOfDate);
      const stage = this.selectReminderStage(snapshot, asOfDate);
      if (!stage) {
        summary.skipped += 1;
        continue;
      }

      const alreadySent = await this.hasActionForDate(borrower.id, loan.id, stage.actionType, asOfDate);
      if (alreadySent) {
        summary.skipped += 1;
        continue;
      }

      const context = await this.buildBorrowerFinancialContext(borrower.id, loan.id);
      const reminderText = this.buildReminderMessage(context, stage);

      let providerMessageId: string | undefined;
      let status: BorrowerMessageStatus = 'responded';

      try {
        const result = await this.sendWhatsAppMessage(borrower.phone || '', reminderText);
        providerMessageId = result.providerMessageId;
      } catch (error: any) {
        status = 'failed';
        summary.failures += 1;
        this.logger.warn(
          `Failed sending ${stage.actionType} for loan ${loan.id}: ${error?.message || error}`,
        );
      }

      const reminderMessageEntity = this.messageRepo.create({
        borrower: { id: borrower.id } as any,
        loan: { id: loan.id } as any,
        channel: 'whatsapp',
        direction: 'outbound',
        messageType: stage.messageType,
        messageContent: reminderText,
        providerMessageId,
        status,
        metadata: {
          automated: true,
          stage: stage.actionType,
        },
      } as any) as unknown as BorrowerMessage;

      const outbound = await this.messageRepo.save(reminderMessageEntity);

      await this.createRecoveryAction({
        borrowerId: borrower.id,
        loanId: loan.id,
        messageId: outbound.id,
        actionType: stage.actionType,
        status: status === 'failed' ? 'failed' : stage.actionType === 'escalation' ? 'escalated' : 'completed',
        riskScore: context.riskScore,
        riskCategory: context.riskCategory,
        details: {
          dueDate: stage.dueDate,
          dueAmount: stage.dueAmount,
          overdueDays: stage.overdueDays,
          title: stage.title,
        },
      });

      if (status !== 'failed') {
        if (stage.actionType === 'escalation') {
          summary.escalations += 1;
          await this.notifyStaffEscalation(context, 'Account exceeded 7 overdue days during daily sweep.');
        } else {
          summary.remindersSent += 1;
        }
      }
    }

    return summary;
  }

  async listOverdueBorrowers(user: any) {
    const loans = await this.loanRepo.find({
      where: {
        status: In(['active', 'overdue', 'defaulted']) as any,
      },
      relations: ['client', 'client.branch', 'installments'],
    });

    const borrowerIds = new Set<string>();
    const asOfDate = new Date();

    for (const loan of loans) {
      const borrower = loan.client;
      if (!borrower?.id) continue;

      if (user?.role !== 'admin') {
        const branchId = (borrower.branch as any)?.id;
        if (!user?.branch || branchId !== user.branch) continue;
      }

      const snapshot = this.buildLoanSnapshot(loan, asOfDate);
      if (snapshot.overdueDays > 0 || loan.status === 'overdue' || loan.status === 'defaulted') {
        borrowerIds.add(borrower.id);
      }
    }

    const results = [] as any[];
    for (const borrowerId of borrowerIds) {
      const context = await this.buildBorrowerFinancialContext(borrowerId);
      const borrower = await this.clientRepo.findOne({
        where: { id: borrowerId },
        relations: ['branch'],
      });

      if (!borrower) continue;

      results.push({
        borrowerId: context.borrowerId,
        borrowerName: context.borrowerName,
        phone: borrower.phone,
        branchId: (borrower.branch as any)?.id || null,
        branchName: (borrower.branch as any)?.name || null,
        outstandingBalance: context.outstandingBalance,
        currency: context.currency,
        nextPaymentDate: context.nextPaymentDate,
        overdueDays: context.overdueDays,
        missedPayments: context.missedPayments,
        ignoredReminders: context.ignoredReminders,
        brokenPromises: context.brokenPromises,
        riskScore: context.riskScore,
        riskCategory: context.riskCategory,
        primaryLoanId: context.primaryLoanId,
      });
    }

    return results.sort((a, b) => {
      const categoryRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<RecoveryRiskCategory, number>;
      if (categoryRank[b.riskCategory] !== categoryRank[a.riskCategory]) {
        return categoryRank[b.riskCategory] - categoryRank[a.riskCategory];
      }
      return Number(b.overdueDays || 0) - Number(a.overdueDays || 0);
    });
  }

  async getRecoveryDashboard(user: any) {
    const overdueBorrowers = await this.listOverdueBorrowers(user);

    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);

    const interactionsTodayQb = this.messageRepo
      .createQueryBuilder('message')
      .leftJoin('message.borrower', 'borrower')
      .leftJoin('borrower.branch', 'branch')
      .where('message.created_at >= :start', { start: start.toISOString() });

    if (user?.role !== 'admin') {
      interactionsTodayQb.andWhere('branch.id = :branchId', { branchId: user?.branch || '__NONE__' });
    }

    const interactionsToday = await interactionsTodayQb.getCount();

    const promisesQb = this.promiseRepo
      .createQueryBuilder('promise')
      .leftJoin('promise.borrower', 'borrower')
      .leftJoin('borrower.branch', 'branch')
      .where('promise.status = :status', { status: 'open' });

    if (user?.role !== 'admin') {
      promisesQb.andWhere('branch.id = :branchId', { branchId: user?.branch || '__NONE__' });
    }

    const openPromises = await promisesQb.getCount();

    const escalations = await this.getEscalations(user, 20);

    return {
      asOf: new Date().toISOString(),
      totals: {
        overdueBorrowers: overdueBorrowers.length,
        highRisk: overdueBorrowers.filter((row) => row.riskCategory === 'HIGH').length,
        mediumRisk: overdueBorrowers.filter((row) => row.riskCategory === 'MEDIUM').length,
        lowRisk: overdueBorrowers.filter((row) => row.riskCategory === 'LOW').length,
        openPromises,
        escalationAlerts: escalations.length,
        interactionsToday,
      },
      overdueBorrowers,
      escalationAlerts: escalations,
    };
  }

  async getBorrowerConversation(borrowerId: string, user: any) {
    const borrower = await this.clientRepo.findOne({
      where: { id: borrowerId },
      relations: ['branch'],
    });

    if (!borrower) throw new NotFoundException('Borrower not found');
    this.ensureScopeForBorrower(user, borrower);

    const context = await this.buildBorrowerFinancialContext(borrowerId);

    const messages = await this.messageRepo.find({
      where: {
        borrower: { id: borrowerId } as any,
      },
      relations: ['loan'],
      order: { timestamp: 'DESC' },
      take: 200,
    });

    const promises = await this.promiseRepo.find({
      where: {
        borrower: { id: borrowerId } as any,
      },
      relations: ['loan', 'sourceMessage'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const actions = await this.actionRepo.find({
      where: {
        borrower: { id: borrowerId } as any,
      },
      relations: ['loan', 'message'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return {
      borrower: {
        id: borrower.id,
        name: borrower.name,
        phone: borrower.phone,
        branchId: (borrower.branch as any)?.id || null,
        branchName: (borrower.branch as any)?.name || null,
      },
      context,
      messages,
      paymentPromises: promises,
      recoveryActions: actions,
    };
  }

  async getBorrowerPromises(borrowerId: string, user: any) {
    const borrower = await this.clientRepo.findOne({
      where: { id: borrowerId },
      relations: ['branch'],
    });

    if (!borrower) throw new NotFoundException('Borrower not found');
    this.ensureScopeForBorrower(user, borrower);

    return this.promiseRepo.find({
      where: {
        borrower: { id: borrowerId } as any,
      },
      relations: ['loan', 'sourceMessage'],
      order: { createdAt: 'DESC' },
    });
  }

  async getEscalations(user: any, limit = 100) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));

    const qb = this.actionRepo
      .createQueryBuilder('action')
      .leftJoinAndSelect('action.borrower', 'borrower')
      .leftJoinAndSelect('borrower.branch', 'branch')
      .leftJoinAndSelect('action.loan', 'loan')
      .leftJoinAndSelect('action.message', 'message')
      .where('action.action_type = :actionType', { actionType: 'escalation' })
      .orderBy('action.createdAt', 'DESC')
      .take(safeLimit);

    if (user?.role !== 'admin') {
      qb.andWhere('branch.id = :branchId', { branchId: user?.branch || '__NONE__' });
    }

    return qb.getMany();
  }
}
