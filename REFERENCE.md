# Read-only UI reference

Source: `maxtakaharu34-cmd/fx-ai-tool`, main `73c914cda98d234f5c93c87dd56ac2282e7f2e8f`.

This iteration follows the source's actual structure: white header, horizontal outlined toolbar, 240px signal card left, technical grid right, then a full-width chart and history. It uses the same blue accent, Noto Sans JP font family, compact font sizes, light-gray panel interiors, 12px panel corners and spacing. The previous independent navy sidebar and oversized section headings were removed.

The admin adopts the reference admin's dark #0d1117 / #161b22 palette, thin gray borders, blue accent and centered content. Its actual controls manage this independent synthetic scene.

The reference repository has not been changed. No licensing, real-market execution or fake performance claims were copied. The Site permanently indicates demo data and administrator-set signals.

## Additional demo-terminal UI reference — 2026-11-06

Public sources inspected read-only:
- DMM FX demo introduction: https://fx.dmm.com/demo/
- DMMFX STANDARD quick guide: https://fx.dmm.com/manual/standard_fx/
- Official screen illustration: https://fx.dmm.com/_img/demo/demo_standard.png
- Official mobile chart illustration: https://fx.dmm.com/_img/demo/demo_img_sp_01.png?20221013

The illustrations were visually inspected for composition only and are not distributed in this application. The independent UI adopts the familiar large central dark chart, a compact side information panel, restrained borders, horizontal data tabs and small numeric summaries. Its own FX DEMO name, clearly synthetic index and administrator-set signal disclosure remain. No competitor branding, logos, screenshots, order panels, licenses or account values are copied.

The administrator screen uses a three-step editing flow and a real, local signal preview before publication. Desktop places controls before the preview in DOM order; smaller screens provide explicit edit/preview navigation. Technical indicators, price history and published change history are retained behind accessible keyboard-operated tabs on both screens.

## Supplied UI specification — 2026-11-06

The user supplied `fx-simulator-ui-spec.md` and a Claude artifact link. The supplied document distinguishes third-party measurements of our existing viewer, official DMM material, inferences and design proposals. Its competitor trading DOM and the authenticated administrator screen were not measured. We have not independently verified those measurements. The artifact page could not be retrieved with the web tool and browser control remains disabled; its HTML and screenshots were not attached. This implementation follows the written specification, rather than claiming a pixel match to an unseen prototype.

Viewer changes: a single 48px header, direction colors with textual arrows, all six signal labels, an explanation when the displayed signal differs from the generator direction, explicit previous-candle/visible-period comparison, a sticky compact mobile signal summary, a four-panel mobile dock, bounded desktop data panels, responsive chart dimensions, locally persisted display preferences and reduced-motion-aware update feedback. Japanese colors are the default, with an international alternative in the display menu. Candles have separate brighter colors on the dark chart for legibility.

The viewer uses native Japanese system fonts instead of loading Google Fonts. This removes the viewer's remote font request and font swap rather than guessing unmeasured fallback `size-adjust` metrics. Chart height is reserved in CSS and the large watermark lettering is decorative inline SVG. No measured CLS or LCP improvement is claimed: real-browser performance measurement remains outstanding.

The administrator redesign described as a separate task in the supplied document has not been implemented. Existing owner authentication, publication, conflicts, audit history and common-scenario semantics remain. Shared chart rendering gains an explicit comparison label and six level names, but no separate draft-storage system, management roles or artificial public amount fields were added. No competitor assets were copied and the original GitHub repository was not modified.
