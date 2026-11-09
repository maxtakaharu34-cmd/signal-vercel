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

The default uses Supabase's standard email link with server-side PKCE. The allowlisted owner receives an email; the callback exchanges its one-time authorization code using a verifier kept in an encrypted Secure HttpOnly SameSite=Lax cookie. The server confirms the owner identity, then stores provider tokens only in an encrypted Secure HttpOnly SameSite=Strict session. Entry code 111 is still required for management. Caller-supplied Sites identity/service headers are discarded.

Supabase Site URL is `https://fx-signal-terminal.vercel.app`. The exact callback `https://fx-signal-terminal.vercel.app/api/auth/callback` is registered alongside the existing Sites redirect. No wildcard or paid plan is needed. Open the email link in the browser that requested it. Missing, expired or altered verifier cookies and different/unconfirmed/anonymous identities fail closed. The callback redirects to a clean admin URL, never sends access/refresh tokens to JavaScript, and never grants administrator access before PIN entry.

Optional `OWNER_AUTH_METHOD=code` retains the six-digit OTP flow, for a provider configuration that can customize email templates. `docs/auth-email-template.html` is an optional template for that mode; it is not applied to the current free provider. Current dashboard requires custom SMTP or Pro to edit its default templates; neither was purchased/configured.

Email resend has a client cooldown, verification stays bound to the requested email, and the link-completion button trusts only the server session. The owner completed the actual email link in their phone browser. The real provider confirms the owner, and production request logs show successful PIN login (200) at 2026-11-09 20:28:30 JST. No session credentials were read or copied.

## Deployment status

Published 2026-11-09 with the authenticated Vercel CLI, after the native connector continued returning 403 even following team consent. Separate project `fx-signal-terminal` (`prj_OzDhNsMaqBtmlVPJzaqKKeRAlJq8`), current production deployment `dpl_3H8yd5PXXVq6nz4oSfYy1QAP77Dd`, Node 24, Tokyo functions. Six server variables are production Secrets; `SITE_ORIGIN` is the canonical production origin. Source is uploaded from this independent local repository; the reference GitHub was not changed or linked.

Anonymous production HTML/assets/shared API reads return 200. Browser chart prices and signals update automatically. PIN-only and forged-identity administrator requests return 401; foreign-origin writes return 403. The existing Sites viewer still returns 200 and uses the same database. Runtime error scan since publication returned no records. The production authentication mail, confirmed owner sign-in, and PIN login are verified from the real provider and production request logs. An authenticated live scene edit has not been performed just for testing. Provider return URLs are configured; custom templates are not required. Existing management entry remains https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site/admin/ (owner Site sign-in plus 111).

## Checks

`npm test` and `npm run build` passed before the refinement publication (97 unique tests validated). Production HTTP checks and the actual deployed UI screenshot are in the sibling `vercel-migration-evidence` folder. Mocked authentication tests are not evidence of a real Supabase owner login.
