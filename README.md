# Flatmate Ledger

Flatmate Ledger is a house-focused expense tracker for shared flats in Pakistan.

It helps a house manager and flatmates track:

- rent and utility bills
- shared groceries and services
- cash collected and spent
- payment proof and confirmations
- disputes and comments
- monthly settlements

## Why this exists

Shared flat finances are often handled in WhatsApp chats and manual notes. Flatmate Ledger turns that into a clean, auditable house ledger.

## Current foundation

- product specification: `FLATMATE_LEDGER_PRODUCT_SPEC.md`
- initial database schema: `supabase/schema.sql`
- sample seed data: `supabase/seed.sql`
- settlement engine: `src/domain/debt.ts`
- API scaffold: `src/api/`
- admin dashboard: `frontend/`

## Core architecture choice

- Frontend: Flutter or React Native
- Backend: Supabase
- Database: PostgreSQL
- Storage: Supabase Storage
- Auth: OTP by phone/email

## Dev scripts

```bash
npm install
npm run check
npm run build
npm start
```

## Environment

Optional Supabase persistence:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_MODE=real`

If those are present, the API hydrates from Supabase on boot and mirrors writes to it.
If `SUPABASE_AUTH_MODE` is set to `real`, OTP login uses Supabase Auth instead of the local dev OTP flow.

The dashboard is served from `/` by the same Node server and talks directly to the API routes.

## Next implementation steps

1. Add auth and house membership flows.
2. Wire expense creation and split calculation.
3. Add payment confirmation and cash ledger updates.
4. Build manager dashboard and settlement reporting.
