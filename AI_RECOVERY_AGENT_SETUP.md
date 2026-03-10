# AI Recovery Agent Setup

## 1. Database Migration
Run the new migration before enabling the feature in production:

```bash
npm run migration:run
```

Migration added:
- `src/migrations/1762500000000-AddAiRecoveryTables.ts`

New tables:
- `borrower_messages`
- `payment_promises`
- `recovery_actions`

## 2. Environment Variables
Add these variables to your backend environment.

### Core AI/Recovery
- `OPENAI_API_KEY` - API key for LLM provider.
- `OPENAI_MODEL` - model name (default: `gpt-4o-mini`).
- `OPENAI_BASE_URL` - compatible OpenAI endpoint (default: `https://api.openai.com/v1`).

### WhatsApp Provider Selection
- `WHATSAPP_PROVIDER` - `twilio` (default) or `meta`.

### Webhook Security
- `WHATSAPP_WEBHOOK_URL` - full external URL for signature verification (recommended for Twilio).
- `WHATSAPP_VALIDATE_TWILIO_SIGNATURE` - `true`/`false` (default secure mode unless disabled).
- `WHATSAPP_WEBHOOK_TOKEN` - shared token for webhook validation (Meta or generic fallback).
- `WHATSAPP_META_APP_SECRET` - Meta app secret for `x-hub-signature-256` validation (optional but recommended).

### Rate Limiting
- `WHATSAPP_RATE_LIMIT_MAX_REQUESTS` - max inbound requests per sender in window (default: `20`).
- `WHATSAPP_RATE_LIMIT_WINDOW_MS` - rate limit window in milliseconds (default: `60000`).

### Twilio WhatsApp
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `WHATSAPP_TWILIO_FROM` (example: `whatsapp:+14155238886`)
- Optional alias: `TWILIO_WHATSAPP_FROM`

### Meta WhatsApp Cloud API
- `WHATSAPP_META_ACCESS_TOKEN`
- `WHATSAPP_META_PHONE_NUMBER_ID`

### Optional Phone Normalization
- `WHATSAPP_DEFAULT_COUNTRY_CODE` (default: `+263`)

## 3. Twilio Webhook Configuration
In Twilio Console (WhatsApp sender or Messaging Service), configure incoming webhook to:

- `POST https://<your-domain>/whatsapp/webhook`

Use HTTPS in production.

## 4. Meta Webhook Configuration (Optional)
If using Meta Cloud API:
- Configure callback URL to `https://<your-domain>/whatsapp/webhook`
- Verification endpoint (GET) is implemented at the same path.
- Set verify token to match `WHATSAPP_WEBHOOK_TOKEN`.

## 5. Scheduled Reminder Worker
Daily cron is implemented in:
- `src/modules/ai-recovery-agent/ai-recovery-agent.processor.ts`

Schedule: every day at 08:00 server time.

Reminder stages:
1. upcoming payment reminder (due in 2 days)
2. due today reminder
3. overdue notice
4. escalation after 7 overdue days

## 6. API Endpoints
Public webhook:
- `POST /whatsapp/webhook`
- `GET /whatsapp/webhook` (Meta verify challenge)

Secured recovery endpoints:
- `GET /ai-recovery-agent/dashboard`
- `GET /ai-recovery-agent/overdue-borrowers`
- `GET /ai-recovery-agent/borrowers/:borrowerId/conversation`
- `GET /ai-recovery-agent/borrowers/:borrowerId/promises`
- `GET /ai-recovery-agent/escalations`
- `POST /ai-recovery-agent/process-reminders`

## 7. Frontend Routes
Added routes:
- `/recovery-dashboard`
- `/borrower-conversation/:borrowerId`

## 8. Testing Commands
Backend:

```bash
cd backend
npm run lint
npm test
```

Frontend:

```bash
cd finance-custom-data
npm run build
npm test
```

## 9. Deployment Checklist
1. Run backend migration.
2. Set required env vars for AI + WhatsApp provider.
3. Configure webhook URL in provider console.
4. Deploy backend and frontend.
5. Verify webhook reachability and signature/token validation.
6. Trigger manual sweep (`POST /ai-recovery-agent/process-reminders`) for smoke test.
7. Confirm dashboard data in `/recovery-dashboard`.
