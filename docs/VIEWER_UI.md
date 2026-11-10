# Light viewer terminal

The viewer uses a compact quote header, a chart-first phone layout, and a live
signal sheet. Desktop keeps the signal beside the chart. All viewer styles,
including phone and landscape overrides, live in `web/viewer.css`; administrator
mobile rules remain separate. The administration flow and common data API are
unchanged.

The visual reference is the publicly published DMM FX light-theme screenshot:
https://fx.dmm.com/fx/service/tool/smartphone_app/
This is a reference for layout and typography, not an installed-app or DevTools
capture. No DMM branding, images, order buttons, or quote data are embedded.

## Interactive chart

`web/terminal-chart.mjs` owns Lightweight Charts 5.2.1 and exposes `update`,
`follow`, `state`, and `destroy`. It receives the same authoritative scene as the
rest of the viewer. Indicators use existing calculations; no prices or signals
are generated in the adapter. Absolute candle IDs preserve selection and visible
ranges across live appends, buffer rotation, and scenario changes. Only actual
simulation timestamps receive JST labels; older unknown times use `T<number>`.

The 36/72 controls are view presets, not market timeframes. Manual zoom removes
the preset selection. Panning retains the historical view until the user returns
to the latest candles. At most 120 retained candles are available. SVG is the
compatibility renderer for environments without Canvas; the administrator
preview continues using SVG.

The built-in TradingView attribution remains enabled. The public demo guide
also includes the notice required by the upstream NOTICE file.

## Verification boundaries

- Existing UI/API tests cover shared data, authorization, local settings, and
  no-write viewer actions.
- Adapter tests check view retention, zoom, buffer expiry, selection, indicator
  data and lifecycle using an injected chart API.
- An integration test exercises the installed Lightweight Charts implementation
  with a DOM and no-op Canvas. It checks API compatibility and pane/range behavior,
  not rendered pixels or physical touch gestures.
- Release visual checks must use an enabled browser: 320/375/390/430px portrait,
  short phone landscape and desktop. Check no horizontal page overflow, 44px
  primary targets, a chart region occupying at least half of 390x844, modal
  close/focus behavior, touch pan/pinch/inspection and a live update while browsing.
  Automated checks do not substitute for these visual checks.

## Browser verification — 2026-11-10

Verified in Chrome against the production build with the production CSP and
read-only public scene data. Portrait widths 320, 375, 390 and 430 had no page
horizontal overflow; primary chart/navigation targets were at least 44px. At
390x844 the chart region was 624px and the default price plot was 508px.
Also checked 844x390 and 640x320 landscape, expanded chart close visibility,
1280x800 desktop, keyboard candle selection, native drag pan and wheel zoom,
historical viewing through live updates, RSI/MACD/bands, the live signal sheet,
and all data tabs. Full OHLC tables scroll within their container. No application
console errors were observed. Physical-device multi-touch pinch was not tested.

The browser pass found and fixed an SVG hidden-attribute issue, grid items that
failed to stretch, a signal-sheet CSS conflict, and insufficient chart space in
short landscape layouts. The compatibility SVG renderer remains available.
