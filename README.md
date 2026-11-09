# FX DEMO — Vercel edition

Transparent common-scenario synthetic index monitor. No actual trading, customer money, balances, wallets or identity documents. The reference GitHub repository remains unchanged. Production viewer: https://fx-signal-terminal.vercel.app/ . The existing Sites application also serves the white UI (release 23, Sites source commit 3c38e2ad09477a7244c13315363fd2b66cfd381a).

## Run

Node 22 or 24. `npm ci`, `npm run build`, `npm start`.
Development: `npm run dev` (127.0.0.1:3110). Configure the six server variables in `.env.example`. For local read-only UI verification, `SIGNAL_READ_FALLBACK_URL=https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site npm run dev` can read the existing public simulator. This proxy is disabled in production and grants no admin access.

## Architecture

- Next.js App Router route handlers, TypeScript, Node runtime on Vercel (Tokyo).
- `/`: public monitor; `/admin`: owner-only administration.
- `/api/[...path]`: common shared scene reads and owner-authenticated writes.
- Existing Supabase database and private bridge; changes use version checks and audit logs. A narrowly scoped migration allows an independent Vercel credential while preserving the existing Sites credential.
- Supabase Realtime broadcasts invalidate stale data. Price frames are derived from shared server time and refreshed using authoritative API reads.
- `web/irregular-price.mjs`: seeded multiscale synthetic path, variable volatility and occasional pulses. All viewers receive the same conditions; no individual targeting.
- Synthetic-price and demo disclosures remain visible.

## Owner authentication

Supabase email OTP verifies only `OWNER_EMAIL`; tokens stay in an encrypted Secure HttpOnly SameSite=Strict cookie. Then the existing three-digit entrance code grants a signed session bound to that verified identity. Caller-supplied Sites identity/service headers are discarded. The entrance code alone cannot grant access.

Supabase setup required before claiming admin login works: in Authentication → Email Templates, include `{{ .Token }}` in both **Confirm signup** (first owner login) and **Magic Link** (subsequent logins). Use a subject/body clearly identifying FX DEMO. Verify email delivery to the configured owner. These provider settings and real owner email delivery have NOT been verified in this migration yet. The dashboard currently requires sign-in. No email has been sent by this implementation session.

## Deployment status

Published 2026-11-09 with the authenticated Vercel CLI, after the native connector continued returning 403 even following team consent. Separate project `fx-signal-terminal` (`prj_OzDhNsMaqBtmlVPJzaqKKeRAlJq8`), production deployment `dpl_DurF48cwK5VCV97pw2pvSbzXeiiB`, Node 24, Tokyo functions. Six server variables are production Secrets; `SITE_ORIGIN` is the canonical production origin. Source is uploaded from this independent local repository; the reference GitHub was not changed or linked.

Anonymous production HTML/assets/shared API reads return 200. Browser chart prices and signals update automatically. PIN-only and forged-identity administrator requests return 401; foreign-origin writes return 403. The existing Sites viewer still returns 200 and uses the same database. Runtime error scan since publication returned no records. Real Vercel owner email delivery/login and an authenticated Vercel scenario edit remain unverified pending Supabase email-template configuration. Existing management entry remains https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site/admin/ (owner Site sign-in plus 111).

## Checks

`npm test` and `npm run build` passed before publication (90 tests). Production HTTP checks and the actual deployed UI screenshot are in the sibling `vercel-migration-evidence` folder. Mocked authentication tests are not evidence of a real Supabase owner login.
