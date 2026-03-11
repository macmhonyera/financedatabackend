# Finance Backend (NestJS + TypeORM + Postgres)

Production-oriented microfinance backend scaffold with:

- JWT auth + role-based access control
- Branch-scoped client/loan/payment access
- Configurable loan products
- Auto-generated repayment schedules (flat/reducing)
- Payment posting with balance updates and installment allocation
- Deterministic, explainable credit scoring engine with score history
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
- `client-assets`: client asset registry with market valuations (for collateral loans)
- `loan-products`: configure product rules (amount bounds, term, frequency, rates, schedule type)
- `loans`: create/approve/reject loans + schedule + portfolio summary
- `payments`: post payments, idempotency support, reconciliation status
- `credit`: score/history/model-health
- `credit-score`: deterministic client credit score compute/latest/history
- `compliance`: KYC, complaints, AML events, audit, regulatory metrics
- `notifications`: templates, enqueue, process queue, my in-app notifications

## Notes

- `synchronize` is enabled outside production for rapid iteration.
- For production, use migrations and secure provider credentials.
- Twilio delivery requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.

## Migrations

Create and run migrations:

```bash
npm run migration:run
```

Added migration:

- `src/migrations/1762000000000-AddCreditScoreResultsAndClientProfileColumns.ts`

## Deploy backend to Vercel

This repository now includes:

- `api/index.ts`: serverless NestJS entry point for Vercel
- `vercel.json`: rewrites all routes to the backend function

Deploy steps:

1. Install the Vercel CLI (if needed):

```bash
npm i -g vercel
```

2. Link this backend folder to your Vercel project/team:

```bash
vercel link
```

3. Add required environment variables in Vercel (Project Settings > Environment Variables), for example:

- `NODE_ENV=production`
- `DATABASE_URL` (recommended for managed providers like Supabase)
- `DATABASE_SSL=true` (optional override; auto-enabled for Supabase URLs/hosts)
- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ORIGINS`
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` (if SMS is enabled)

4. Deploy:

```bash
vercel --prod
```
