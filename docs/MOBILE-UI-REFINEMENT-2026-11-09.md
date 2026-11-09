# Mobile UI refinement — 2026-11-09

## Observations and references

- Read-only reference app `https://fx-ai-tool.vercel.app/` currently returns HTTP 500 / FUNCTION_INVOCATION_FAILED. No reference repository or deployment was modified. Current source or pixel parity with that unavailable application is not claimed.
- Reviewed official DMM FX mobile product screenshots: https://fx.dmm.com/fx/service/tool/smartphone_app/ (theme and chart illustrations). These show product identity, quote hierarchy, chart tools close to the chart, and distinct navigation. They are published illustrations, not a live authenticated trading session. No third-party branding or screen assets are used in the app.
- Inspected the existing deployed application in Chrome at 390 × 844 and compared it to the revised local application. DOM/computed-style and bounding-rectangle inspection supplements visual screenshots; it is not a physical iPhone/Safari test.

## Resulting design changes

- Instrument and large current quote lead the phone screen. A separate signal row shows direction, level, source and the full six-level scale.
- Non-chart pages use a shorter quote header, leaving more room for history and analysis.
- Phone chart has a minimum 240 px plot. Small displays scroll rather than squeezing the plot down to 116 px. At 375 × 667 the plot is 240 px; at 390 × 844 it is 354 px. Landscape 667 × 375 retains a 125 px plot and the action row above the dock.
- Settings use a native modal dialog, presented as a bottom sheet on phones. Native focus containment, Escape dismissal and an explicit close control replace the small floating menu.
- Previous/next candle controls support precise inspection, with disabled edge states and an explicit latest-candle action. Inspection remains anchored during updates.
- Cleaner chart range selection, legible OHLC groups, compact history columns and consistent chart navigation.
- Admin direction actions include distinct symbols and descriptions. Stop is visible before optional tuning; speed and volatility live in an expandable section. Fixed preview heading wrapping and selected-button contrast on phones.
- Disclosure of simulated prices, common scenarios, owner authentication and all server-side behavior are preserved. No production scenario changes were needed for UI verification.

## Verification

- 99 automated tests passed, including adjacent-candle navigation and modal handoff to the demo guide.
- Production build passed.
- Browser inspected: 320 × 568, 375 × 667, 390 × 844, 667 × 375, 881 × 1051 and 1280 × 800. No document-level horizontal overflow observed. Small portrait screens intentionally scroll vertically.
- Local owner-only visual fixture used an isolated in-memory database and `review@example.invalid`, not production owner credentials. Admin navigation, preview, tuning disclosure and stop placement were inspected there. At 375 × 667 the stop button spans y=478–522.
- Screenshots: sibling evidence folder `vercel-migration-evidence/mobile-refinement-2026-11-09/`. Local screenshots must not be represented as production authentication evidence.
- Limitations: no physical iPhone Safari, screen-reader session or device keyboard test this iteration; no current authenticated benchmark trading screen was accessed.

## Published verification

- Implementation commit: `5304e29`.
- Vercel deployment: `dpl_C2Ku3epZtQLFfMmJpSqBZp93RZpQ`, READY, production alias https://fx-signal-terminal.vercel.app/ .
- Anonymous requests to `/`, `/admin`, `/mobile.css` and `/api/scene` all returned HTTP 200. Owner operations remain protected; HTTP 200 on `/admin` serves the login shell.
- Published viewer verified at 390 × 844: 390 px document width, 354 px plot, 35 px quote; native settings dialog bottom aligned at y=844; previous-candle inspection produced a crosshair and JST selection. Live connection showed リアルタイム接続. Shared revision remained #0024.
- Published screenshots: `published-mobile-390.png` and `published-settings-390.png`; structured evidence: `verification.json` in the sibling evidence folder noted above.
