# Finance Backend (NestJS + TypeORM + Postgres)

Production-oriented microfinance backend scaffold with:

- JWT auth + role-based access control
- Branch-scoped client/loan/payment access
- Configurable loan products
- Auto-generated repayment schedules (flat/reducing)
- Payment posting with balance updates and installment allocation
- Credit scoring integration (external ML service)
- Compliance domain (KYC, complaints, AML events, audit logs, regulatory metrics)
- Notification platform (in-app, email, SMS) with templates/retries
- Twilio SMS adapter + mail provider abstraction

## Quick start

1. Copy `.env.example` to `.env` and configure secrets/providers.
2. Install dependencies:

```bash
npm install
```

3. Seed database:

```bash
npm run seed
```

4. Run in dev:

```bash
npm run start:dev
```

Server defaults to `http://localhost:3031`.
Swagger docs: `http://localhost:3031/api/docs`

## Key API modules

- `auth`: login
- `clients`: client CRUD with branch scope
- `loan-products`: configure product rules (amount bounds, term, frequency, rates, schedule type)
- `loans`: create/approve/reject loans + schedule + portfolio summary
- `payments`: post payments, idempotency support, reconciliation status
- `credit`: score/history/model-health
- `compliance`: KYC, complaints, AML events, audit, regulatory metrics
- `notifications`: templates, enqueue, process queue, my in-app notifications

## Notes

- `synchronize` is enabled outside production for rapid iteration.
- For production, use migrations and secure provider credentials.
- Twilio delivery requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
