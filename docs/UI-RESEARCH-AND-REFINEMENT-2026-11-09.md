# UI research and refinement — 2026-11-09

## 今回の変更と公開先

- [表示画面](https://fx-signal-terminal.vercel.app/) / [管理画面](https://fx-signal-terminal.vercel.app/admin)
- チャートの「指標」から、RSI・MACD・移動平均線・バンドを設定できます。設定は端末内に保存されます。
- 管理画面は、即時反映と公開前の編集を区別し、公開する変更を比較表示します。
- 指定の試作画面、DMMの公開チャート、OANDAとTradingViewの公式資料を調べて反映しました。原本のGitHubは変更していません。
- 106件のテスト、スマホ・横向き・PCの描画確認、公開先での指標切替・価格連動を確認しました。実機のiPhone/Safariを確認したという意味ではありません。

## Scope and primary evidence

This is the UI phase of the existing shared simulation application. The requested direction is a restrained white financial interface, a clear separation between viewer and owner operations, useful charts and signals, responsive interaction, and real behavior rather than a static mockup. Backend product expansion is deferred. Real funds, customer profits, identity documents, fabricated licenses and the original GitHub repository are outside this UI change.

Read the entire supplied `fx-simulator-ui-spec.md`, including the prototype and administrator proposals. Treat proposed measurements as proposals, not independently measured competitor facts.

| Source | What was actually inspected | Result used |
|---|---|---|
| User-supplied prototype https://claude.ai/artifact/JdLXzVZdGvowKXwGSXS9Ks | Now accessible in Chrome, despite web-reader failure. Viewed desktop and phone; inspected the rendered cross-origin iframe through the documented frame locator. At 390 px, iframe height was 828 px, plot 364 × 420 px, plot bottom 720 px; controls 12 px / 44 px, secondary quote 20 px. | Chart and adjacent signal hierarchy, all six names, separate generator/signal meanings, consistent navigation. Our larger 35 px phone quote, 14 px OHLC and complete upper signal scale deliberately improve the prototype's density. White chart follows the user's later white preference and the live DMM public example; exact pixel parity is not claimed. |
| DMM public chart https://fx.dmm.com/market/chart/chart.html?prod=fx&c1=USD&c2=JPY | Actual live chart screenshot, DOM and computed styles. Buttons/selects 14 px, height 46.8 px, dark navy text on white/light gray. Public chart is not the authenticated trading terminal. | Readable primary controls, restrained colors, adjacent chart actions, explicit latest-candle control. |
| DMM mobile illustrations https://fx.dmm.com/fx/service/tool/smartphone_app/ | Official published illustrations, earlier mobile pass. | Quote hierarchy, separate navigation, chart-first space allocation. |
| OANDA mobile indicator guide https://www.oanda.jp/lab-education/blog_fxtrade/fxtrade_mobile/line-2/ | Official guide describes overlays on price and studies below price. | Group indicator setup in one panel and separate the indicator scale from the price scale. |
| TradingView RSI https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/ and MACD https://www.tradingview.com/support/solutions/43000502344-moving-average-convergence-divergence-macd-indicator/ | Official definitions and formulas. | Wilder RSI 14 and EMA MACD 12/26/9, three MACD series and zero baseline. No market prediction or trading advice is introduced. |
| Original live reference https://fx-ai-tool.vercel.app/ | Returned HTTP 500 / FUNCTION_INVOCATION_FAILED in this review. | No current source or pixel-parity claim. Original repository and deployment remain unmodified. |

## Implemented refinements

1. **Meaningful chart studies.** Optional RSI or MACD pane shares candle positions, selected time and visible window with the price chart. Values use the same synthetic data and seed conventions as existing numeric indicators. Cursor alignment is exact; MACD includes its signal line and difference histogram. Settings cannot publish or alter the shared scenario.
2. **One indicator setup panel.** Chart-side “指標” opens the native settings dialog. SMA 20, Bollinger bands and the lower study are grouped; color convention and change basis remain below. All display options persist on the current device. Narrow summaries ellipsize without wrapping controls vertically.
3. **Actual publication states.** Owner view distinguishes published, unpublished draft, publishing, automatic running, conflict and offline states. It does not claim a nonexistent saved-but-unpublished backend state. Manual preview explicitly says the changes are not public. An inline before/after list shows real configuration, signal, note, announcement and candle-history differences. No extra confirmation modal was added.
4. **Operation scope.** Immediate automatic commands and manual settings requiring publication have explicit badges. Unavailable manual controls are hidden while automatic mode is running. Offline keeps draft edits and blocks publication/automatic commands; stale viewer status no longer remains green “realtime” beside a stale warning.
5. **Consistent white surfaces and direction colors.** Removed leftover dark green admin selections and grayscale signal bars. Viewer and admin use common semantic colors. Larger owner form text, standard control heights and preview labels align both surfaces.
6. **Readability and access.** Main phone quote 35 px, OHLC 14 px; visible secondary text is at least 11 px in inspected viewer panels. Primary controls have 44 px minimum targets. Removed 20 noninteractive signal-history tab stops; summaries retain their accessible description. Native dialog focus containment/Escape and reduced-motion handling remain.
7. **Responsive navigation.** Low landscape layouts retain the four-panel dock even above the 767 px portrait breakpoint. At 568 × 320 the default chart and action row fit above the dock; at 844 × 390 the same is true. The header explicitly identifies virtual prices when the short-height disclosure row is omitted. Optional studies may require vertical scrolling on short screens; expanded low-height charts retain a visible close action while studies remain scrollable.
8. **Large screens.** Above 1600 px, chart height uses 56vh bounded at 620 px. At 1920 × 1080 the plot is 604.8 px high and the document has no horizontal overflow.

## Verification and boundaries

- Full suite: **106 tests passed**; production build passed. Tests include indicator reference cases/history consistency, cursor alignment, local-only study settings, safe before/after text, draft→publishing→published and offline draft retention, plus the existing auth, common-scenario, realtime, conflict and untrusted-text checks.
- Browser checked at 320×640, 375×667 (owner), 390×844, 768×1024, 1440×900, 1920×1080, 568×320 and 844×390. Both the default and optional-study layouts were inspected. No document-level horizontal overflow observed. Small screens intentionally scroll vertically rather than reduce portrait plots below 240 px.
- Default 390×844: plot 354 px, plot bottom 665, action row bottom 712, dock top 780. Default 568×320: plot 96 px, action row bottom 260, dock top 264. Default 844×390: action row bottom 332, dock top 334.
- Selected candle and study cursor x both **256.22222222222223** at phone width 390. Numeric series were compared to historical snapshots rather than fabricated visual curves.
- Targeted computed-text contrast on white: quote 15.89:1, synthetic-price caption 5.21:1, upward signal 5.46:1, OHLC 8.24:1. These are inspected samples, not a whole-site accessibility certification.
- Local actual client/API flow: stopped fixture at revision 25, made three unpublished edits, verified before/after list and unpublished preview, then published revision 26; the independent viewer received the same level/note. This used the localhost-only in-memory visual fixture and fake owner, not production account credentials or a production database write.
- Local console: no captured errors during the inspected flow. No Web Vitals/HAR, physical iPhone Safari, Android device or assistive-technology session was measured. No CLS/LCP improvement claim is made. Native UI DevTools panels are not represented as opened; inspection used actual rendered DOM/computed styles, screenshots and console APIs.
- Existing owner authentication, shared seed/scenario and all server handlers were preserved. Original reference repository was not modified. The mock prototype's random values or state-switch controls were not imported into the production data path.

Evidence: sibling `vercel-migration-evidence/ui-studies-2026-11-09/` contains prototype screenshot/metrics, local RSI/admin screenshots and structured checks. Local owner screenshots are not production-authentication proof. Published verification is appended after deployment.

## Published verification and completion audit

- Code commit `699a389`, deployment `dpl_EyAwuLzFJCvzGz9qVVW1ThPVcyEM`, READY, production https://fx-signal-terminal.vercel.app/ .
- Anonymous GET `/`, `/admin`, `/api/scene`, `/mobile.css`: HTTP 200. The admin response serves its protected login shell plus the new change-summary markup; it does not grant anonymous administrator access.
- Published phone UI at 390×844: 390 px document width, 35 px quote, 14 px OHLC, real RSI/MACD pane and exact shared selected-candle cursor. MACD aria summary includes MACD, signal-line and histogram values. No NaN/Infinity geometry observed.
- Final native browser showed リアルタイム接続, revision #0024. Shared production revision stayed 24 throughout; localhost test publication at revision 26 is independent. Display preference was restored to none and viewport reset to normal 881×1051. Public tab retained. Local test server stopped after verification.
- Proof image `published-rsi-390.jpg` is actual JPEG 390×844. Original screenshot bytes also remain at the initial `.png` path; extension was corrected in the delivery copy without altering the image.

| UI requirement | Authoritative evidence | Audit result |
|---|---|---|
| Research supplied reference and professional finance UI | Rendered prototype iframe metrics/screenshot, live DMM DOM measurements, linked OANDA/TradingView primary documentation | Verified; no claim of copying an unavailable authenticated terminal |
| White cohesive viewer/admin surfaces and understandable hierarchy | Current shared semantic CSS, real phone/admin render, owner selection colors and preview labels | Verified |
| Current synthetic prices, six levels and distinct scenario/signal meaning | Current renderer and disclosure markup; existing six-level/direction tests; live common revision 24 | Verified; no actual-market or monetary representation added |
| Useful chart interaction and locally saved preferences | Published RSI and MACD switching, cursor x alignment, preference restore; historical indicator tests | Verified |
| Clear owner controls, preview, publication scope and feedback | Real isolated client/API/second-viewer flow, before/after draft list, distinct states and offline/failed-write tests | Verified without modifying production scenario |
| Phone/tablet/desktop/landscape responsiveness and navigation | Structured 320/390/768/1440/1920 and 568/844 landscape measurements; real landscape tab switching | Verified; very small optional-study layouts scroll vertically |
| Readability, touch targets and keyboard/modal behavior | 44 px control measurements, 11 px minimum visible viewer text scans across four panels, contrast samples, native dialog and existing keyboard/reduced-motion tests | Verified within inspected scope; no whole-site accessibility certification claimed |
| Working application and delivery | 106 passing tests, successful production build/deployment, HTTP 200 assets and live public browser proof | Verified |
| Preserve data/auth boundaries and reference repository | Change set confined to UI/helpers/tests/docs; server code unchanged; original repository not modified; production revision unchanged | Verified |

The UI research/refinement phase is delivered. Deferred backend product expansion remains outside this phase. Physical-device testing, Web Vitals certification and exact pixel cloning are not represented as completed work.
