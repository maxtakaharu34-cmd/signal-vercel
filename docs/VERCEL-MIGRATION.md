# Migration record — 2026-11-09

Source copied from Sites commit 521505d88662df4fec897417bce0dba0a48e700d. No edits or pushes to the reference repository or existing Sites source.

## UI changes
White chart, lighter grid, compact horizontal controls, aligned price/ohlc fields, flatter signal and setting panels, denser data tabs and technical indicators. No broker logos, copied assets or fabricated credentials. Japanese system fonts; decorative English Dashboard wording removed. Demo and synthetic-price disclosures remain.

## Verification
Current public version 24, price model 2, exact local/public OHLC equality (maximum error 0). Latest sampled 6000 model candles: return lag-1 correlation 0.006716, lag-10 0.011943, lag-30 -0.027485, lag-60 0.013459, lag-120 0.017309; average body/range 0.576438. This measures reduced short periodicity, not equivalence to a real market.

The new Next.js production build succeeds. New API tests reject forged Sites identity headers, service headers, PIN-only access, cross-origin writes, altered owner cookies and unconfirmed/non-owner identities. A verified-email-then-PIN flow is tested with a mocked auth provider. Real owner email delivery and the deployed Vercel flow are pending; do not present mocked authentication as production proof.

## Remaining external work
- Reauthenticate Vercel connector; no project or deployment has been created.
- Sign into Supabase dashboard and configure/verify owner email OTP templates.
- Transfer server-only environment variables to the selected Vercel project and verify its live data and admin flow.
