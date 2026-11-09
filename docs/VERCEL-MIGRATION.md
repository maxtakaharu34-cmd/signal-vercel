# Migration record — 2026-11-09

Source copied from Sites commit 521505d88662df4fec897417bce0dba0a48e700d. No edits or pushes to the reference GitHub repository. After Vercel remained unauthorized, the white presentation was published on the existing Sites host as release 23 (commit 3c38e2ad09477a7244c13315363fd2b66cfd381a), preserving Sites owner authentication and database adapters.

## UI changes
White chart, lighter grid, compact horizontal controls, aligned price/ohlc fields, flatter signal and setting panels, denser data tabs and technical indicators. No broker logos, copied assets or fabricated credentials. Japanese system fonts; decorative English Dashboard wording removed. Demo and synthetic-price disclosures remain.

## Verification
Current public version 24, price model 2, exact local/public OHLC equality (maximum error 0). Latest sampled 6000 model candles: return lag-1 correlation 0.006716, lag-10 0.011943, lag-30 -0.027485, lag-60 0.013459, lag-120 0.017309; average body/range 0.576438. This measures reduced short periodicity, not equivalence to a real market.

The new Next.js production build succeeds. New API tests reject forged Sites identity headers, service headers, PIN-only access, cross-origin writes, altered owner cookies and unconfirmed/non-owner identities. A verified-email-then-PIN flow is tested with a mocked auth provider. Real owner email delivery and the deployed Vercel flow are pending; do not present mocked authentication as production proof.

## Production publication — 2026-11-09

- URL: https://fx-signal-terminal.vercel.app/
- Project: `prj_OzDhNsMaqBtmlVPJzaqKKeRAlJq8`, `fx-signal-terminal`, existing Hobby team `team_vgqTeB9mPhgJMnPYMfrKKbMV`.
- Deployment: `dpl_DurF48cwK5VCV97pw2pvSbzXeiiB`, READY, production, Node 24, Tokyo functions.
- The authenticated CLI succeeded; the native connector continued returning team-access 403 after user consent. The device login completed successfully; revisiting its consumed code showed an invalid-code message.
- Six production Secrets provisioned. A separate random bridge credential is stored only as a SHA-256 hash in the private database table; the old Sites credential stays valid. No trading data or scene configuration was rewritten.
- Actual production HTML, assets, shared scene and audit API return 200; current configuration version is 24. The browser shows a connected WebSocket and evolving chart/signals. PIN-only/forged-identity requests return 401; foreign-origin requests return 403. Invalid database credentials and non-owner publication are rejected. The existing Sites display still returns 200.
- Production runtime error scan returned zero records. Private-table RLS-without-policy notices are intentional deny-by-default tables, with no public table grants; security advisors reported no warning/error findings.

## Remaining external work

Sign into the Supabase dashboard and configure/verify owner email OTP templates and delivery. Vercel's owner email login and an authenticated Vercel scenario edit are not yet verified. The existing Sites owner-authenticated administration remains available and changes the same shared database.
