# FX DEMO — Vercel edition

Transparent common-scenario synthetic index monitor. No actual trading, customer money, balances, wallets or identity documents. The original Sites application and reference GitHub repository remain unchanged.

## Run

Node 22 or 24. `npm ci`, `npm run build`, `npm start`.
Development: `npm run dev` (127.0.0.1:3110). Configure the six server variables in `.env.example`. For local read-only UI verification, `SIGNAL_READ_FALLBACK_URL=https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site npm run dev` can read the existing public simulator. This proxy is disabled in production and grants no admin access.

## Architecture

- Next.js App Router route handlers, TypeScript, Node runtime on Vercel (Tokyo).
- `/`: public monitor; `/admin`: owner-only administration.
- `/api/[...path]`: common shared scene reads and owner-authenticated writes.
- Existing Supabase database and private bridge; changes use version checks and audit logs. No schema changes are needed for the monitor.
- Supabase Realtime broadcasts invalidate stale data. Price frames are derived from shared server time and refreshed using authoritative API reads.
- `web/irregular-price.mjs`: seeded multiscale synthetic path, variable volatility and occasional pulses. All viewers receive the same conditions; no individual targeting.
- Synthetic-price and demo disclosures remain visible.

## Owner authentication

Supabase email OTP verifies only `OWNER_EMAIL`; tokens stay in an encrypted Secure HttpOnly SameSite=Strict cookie. Then the existing three-digit entrance code grants a signed session bound to that verified identity. Caller-supplied Sites identity/service headers are discarded. The entrance code alone cannot grant access.

Supabase setup required before claiming admin login works: in Authentication → Email Templates, include `{{ .Token }}` in both **Confirm signup** (first owner login) and **Magic Link** (subsequent logins). Use a subject/body clearly identifying FX DEMO. Verify email delivery to the configured owner. These provider settings and real owner email delivery have NOT been verified in this migration yet. The dashboard currently requires sign-in. No email has been sent by this implementation session.

## Deployment status

Vercel source/build ready; no Vercel project or deployment created yet. Vercel connector returned `UNAUTHORIZED: reauthentication required`. Reconnect it, then create a separate Next.js project, install the existing six server variables as production secrets, set `SITE_ORIGIN` to its actual production origin, and deploy this directory. Do not upload `.env` files or expose the bridge secret to browser code. Verify `/api/scene`, owner login, a shared audited scenario update, and mobile/desktop UI on the resulting URL before declaring migration complete.

## Checks

`npm test` and `npm run build`. Browser verification and statistics are in the sibling `vercel-migration-evidence` folder. Local preview reads the public existing service; it is not evidence of a completed Vercel deployment or real Supabase owner login.
