# Simple owner entry and reference UI — 2026-11-05

- 34 calculation, DOM, transport and server tests passed. The real PIN form uses `111`, opens the admin controls without a separate email registration, publishes through the API adapter and closes again on logout. Cookie-blocking embedded views use a tested in-memory session header.
- Anonymous callers and another Site identity cannot acquire admin access by knowing the code. Session signatures bind to the authenticated Site user ID. Cross-origin writes, forged identity fields and missing administrator sessions are rejected.
- 25 disposable PostgreSQL checks passed, including existing RLS/ownership behavior plus scoped Site capability validation, owner-only publication, trusted Site actor auditing, stale-write rejection and denial of direct credential-table reads. The string `111` is explicitly rejected as a database capability.
- TypeScript checking and the supported Sites production build passed. Dependency versions were updated from the starter's older pins to patched compatible versions; npm audit reports zero vulnerabilities.
- The original GitHub repository is read-only. The independent display now follows its header, toolbar, 240px signal/technical row, large chart and history. The admin uses the reference dark palette. No fake win percentages, real payments, market execution or customer-profit records were added.
- tests/live-site.mjs verifies the deployed session/login/read/publish/conflict/history/logout endpoints using connector-issued Site access and a scoped server test capability. It republishes the unchanged scene for the write check.
- Browser control remains disabled in this environment. Generated DOM behavior and server/API logic are tested; a platform-generated screenshot is used for the display layout check when available. Real visitor browser interaction is not claimed as automated browser QA.

## Public display and operator tools

- 48 tests pass after shared-read authorization, opt-in automatic apply, serialization of edits arriving during a save, failure retention, offline indicators, public viewer integration and CSV/JSON export checks.
- Tests use the actual Site API adapter for both the anonymous viewer and owner PIN paths. Anonymous callers can read only the common presentation; POST publication and administrator login remain denied.
- History exports cover the redacted, most recent 30 server events, not the entire audit table. Spreadsheet formula strings are escaped. Snapshot JSON selects presentation fields and omits identities and entry-session tokens.
- Public Site audience revision 2 was observed from the native access API during this task; no sharing-policy mutation was performed.
- Browser use was rechecked and remains disabled in Work settings. Happy DOM tests exercise application behavior; they do not prove physical browser layout or mobile rendering.

## Clearer terminal UI — 2026-11-06

- 50 tests pass, including added data-tab mouse/deep-link/keyboard behavior and an administrator signal preview that stays unpublished in manual mode. Existing authentication, public read-only access, auto-save, conflict preservation and export tests remain green.
- CSS syntax and TypeScript checks pass. Responsive CSS configuration is inspected separately from physical browser layout.
- DMM FX public screen illustrations were inspected as composition references; no competitor assets are included in the deployment.
- Browser inventory still reports local browser use disabled in Work settings. Mobile physical display and actual owner-browser interaction remain unverified.

## Supplied-spec viewer update — 2026-11-06

- 57 tests passed. Added coverage verifies the mobile dock/keyboard/chart return path, the independence of display changes from publication, explicit and candle-window-independent prior-close change, selectable period comparison, all six level names and mismatch explanation, local preference persistence/blocked storage, duplicate-safe three-update flashing, and touch-drag inspection. Public viewer startup no longer requests the authenticated-only `/api/session` endpoint; the owner path and anonymous-management denial tests still pass.
- TypeScript and CSS syntax checks passed. A Happy DOM CSS rule inspection covered 320×640, 390×844, 768×1024, 844×390, 1440×900 and 1920×1080 in chart and history states. It confirms the configured panel visibility, 48px header, mobile dock/64px summary and mobile 44px overlay labels. Happy DOM does not verify physical geometry, absence of horizontal overflow, first-viewport chart fit, browser paint timing, CLS or LCP.
- The supplied artifact link is inaccessible to the web tool. Local browser control still reports `Local browser use is disabled in Work settings`. No claim of live DevTools inspection, authenticated administrator browser measurement or iOS/Android QA is made.

## Automatic direction / signal update — 2026-11-06

- All 68 tests passed. New tests cover clock-deterministic shared frames, gradual six-level progression, no command-boundary price jump, gradual reversal with immutable overlapping history, bounded reconstruction after a ten-year gap, stop/resume continuity, stale-frame rejection, invalid clock metadata and automatic signal changes during a flat scenario.
- The actual generated owner PIN form, actual Site client and API are exercised together against an isolated in-memory database transport. The direction buttons start, reverse and stop the common scene; an independent anonymous viewer updates price and signal without a configuration-version increase. Tests verify that automatic frames cause no database writes, manual controls are blocked while running, and non-owner/forged/cross-origin requests cannot command it.
- A read-only query against the actual Supabase project confirmed that both an automation anchor and a projected checkpoint pass the existing PostgreSQL checkpoint validator; the original saved scene remained valid at revision 21. No schema or production data mutation was performed by this check.
- Automatic mode requires a command in the owner panel. A real owner-browser command in production and physical mobile interaction remain unverified because browser control is unavailable; the integration test uses the actual request/client/API code with an isolated database transport. Production release checks continue to verify public reads, anonymous write rejection and common notification delivery.

## Real browser audit and responsive repair (2026-11-06)

Browser control became available in this turn. Real DOM/Computed Style measurements and screenshots revealed and repaired small-screen chart occlusion, a missing landscape quote/signal, and initial rendering of seeded prices before the authoritative scene arrived. Six actual viewport sizes now have no page overflow, the chart time axis fits above the dock or viewport edge, and primary chart controls measure 44px high. See UI-AUDIT-2026-11-06.md for evidence and the exact benchmark/verification limits. 70 tests passed, including pending/failed initial load and retry recovery. Native Chrome DevTools panels, performance/network timings, signed-in admin layout and physical phone testing are not claimed.

## 2026-11-08 シグナルの変化

方向指示の移行度だけで期待度が最高段階に固定されていた計算を変更。直近8ステップの仮想価格の勢いと、41・17・113ステップ幅のシード付き滑らかな不規則変動を合成し、3ステップ保持と短い平滑化を適用する。開始直後は方向指示の移行を優先し、以後は強弱・待機・一時逆行が生じる。説明文も強まり／落ち着き／方向確認で変化する。全閲覧者で同じ時計・シードから計算し、価格生成式・保存済みローソク足・所有者権限・デモ表示は維持する。

既存アンカーはそのまま使用可能。新しい方向指示では任意のinitialSignalScoreを保存し、指示直前のシグナルから連続して移行する。74件のテストとTypeScript検査を通過。追加ケースは3方向での継続的な6段階の変化、3ステップ保持、指示時の価格／シグナル連続性、不正なスコア拒否、長時間後の逆行と非単一周期を確認。

## 2026-11-08 多面的レビュー

詳細はTERMINAL-REVIEW-2026-11-08.md。価格からの3期間比較、変動幅・足形、共通シグナル20判定の推移と実算出内訳、Wilder RSI/ATR、足選択の保持・最新足復帰、生成アンカーに基づくJST軸を実装。81件の自動テストとTypeScript検査、6サイズの実ブラウザーUI検証を実施。データ・権限・公開範囲を変更していない。

## 2026-11-09 不規則な仮想価格モデル

固定周期の波による旧価格モデルは既存履歴の互換性のために保持し、新規の自動シナリオにはpriceModel=2を使用する。新モデルは絶対生成時刻と共通シードから復元する多段の確率的な橋、時間で変わる変動幅、まれな有限のパルスを合成する。12点の足内部経路からOHLCを生成し、開閉連続・正の価格・最大120本の復元上限を維持する。各時点の係数キャッシュは上限付き。

3シード×6,000本で、1本・10本遅れの騰落率自己相関の絶対値が0.15未満、実体の平均比率が0.3〜0.8、実体95%超の割合が35%未満、区間別の標準偏差が変化することを検証。特定の実市場との一致、予測精度・利益は主張しない。

稼働中の旧モデルは未来の確定足を境界に切り替えられる。境界前は旧モデルを配信し、境界後の最初の足は旧モデルの最後の終値から開く。既に見た足を再生成しない。フレーム更新順序はモデル内の相対stepではなく総生成数で比較し、切替時のstepリセットで停止しない。段階的な方向指示・所有者制限・デモ表示は維持。
