# 実装状況

2026-11-09 公開追記: Vercel表示画面 https://fx-signal-terminal.vercel.app/ を公開し、実ブラウザーで自動更新を確認。管理APIの未認証アクセス拒否を本番確認済み。Vercel管理者は標準メールリンク＋サーバー側PKCE＋入口コード方式へ更新。認証戻り先は保存済み。実メールリンクの所有者確認と、本番の入口コードログイン成功（2026-11-09 20:28:30 JST、HTTP200）を確認済み。既存Sites管理画面は同じDBを管理する。以下には以前の検証時点の記録を含むが、現在は実ブラウザー確認済みで、共通自動生成は画面を閉じた時間もサーバー時刻から復元する。

## 動作する機能

- 公開表示画面と管理画面の分離。管理操作は所有者のSites本人認証と入口コード111で制限。
- 全閲覧者で共通の架空指数、ローソク足、生成データから算出する指標。
- 上昇・横ばい・下降、速度、変動幅、1本生成、連続生成、停止、明示的リセット。
- 管理者設定と明示した上昇・下降・横ばいシグナル、極寒〜猛暑の6段階、補足。
- お知らせの表示・非表示。キャンペーン条件やボーナス付与は含まない。
- バージョンを照合したPostgreSQL保存、管理変更の監査、競合時の上書き防止。
- WebSocket更新通知とサーバー読み直し、切断時の定期同期。
- 任意で有効にする自動反映。入力停止後700msで保存し、処理中の追加編集は次の保存へまとめる。失敗時は自動反映を停止し下書きを保持。
- 最後に同期できた時刻、古い表示・オフラインの明示、手動再同期。
- 直近30件までの共通変更履歴の詳細確認・CSV、公開設定JSON、ローソク足CSV。
- 重要事項を先に示すスクロール式のデモ利用案内。
- スマホ・タブレット用配置、44pxの操作対象、狭いチャートの描画・タップ・キーボード操作。

## 元の要件のうち未実装

- サイト独自の顧客登録、メール認証、2段階認証、複数管理者の追加画面。
- BTCと約20種類の通貨ペア、注文、ポジション、残高、損益、レバレッジ、保険、取引履歴。
- 入出金、最低金額、送金先、入金元と出金先の対応管理。
- 入金ボーナス、使用回数、適用チェック、キャンペーンバナーの状態管理。
- 本人確認・撮影・身分証、手書き署名、出金手続き・完了画面。
- 顧客一覧、顧客別残高変更、サイト内DM。
- 法人名・住所・資本金・金融機関の登録番号。

以前の会話と画像で示された外部入金・操作したデモ成績の用途に使うための、見せかけの利益・残高・入出金、認可表示、重要条件を隠す画面は追加しない。現在の機能を、元の取引サイト要件をすべて完成させたものとして扱わない。

## 検証の限界

- ブラウザー操作がWork設定で無効のため、実機の管理者ログイン、携帯端末での見た目は未確認。
- DOM・API・計算テストと本番HTTP/通知回線の確認を、実機での操作確認と区別する。
- 連続生成は管理画面が開いている間だけ動く。画面を離れたとき、通信エラー、競合時に停止する。閉じた画面での常時運転は行わない。

## Viewer update from supplied UI specification (2026-11-06)

Implemented the written viewer specification: compact desktop header, sticky mobile signal summary, mobile chart/history/updates/indicators panels, complete direction-coded level scale, signal-vs-generator explanation, default prior-candle price comparison and optional visible-period comparison, color convention/candle-window local preferences, responsive chart sizing and reduced-motion-aware price feedback. Public viewer initialization skips the administrator session probe. The existing shared database and notification-backed reads remain authoritative; changing a display preference never publishes a scenario.

Not included: the separate administrator redesign, a server-side draft store, prototype sample-data controls/query parameters, new account/transaction/amount features, or original GitHub changes. Prototype HTML/screenshots were not provided and its link could not be retrieved, so visual parity and actual browser viewport/performance criteria remain unverified.

## Automatic common simulation and gradual direction commands (2026-11-06)

The owner panel now has Up / Flat / Down commands and Stop. A command immediately saves a new common anchor through the existing owner-only, version-checked Site bridge; it appears in the existing audit timeline. It does not edit historical candles. Existing manual controls remain available after stopping the automatic mode.

The server computes the current synthetic frame from the saved anchor and its own UTC clock. The drift momentum approaches the commanded direction exponentially (18 generated steps), with bounded synthetic oscillation. Prices do not jump at the command boundary, including reversals. Signal direction and the six-level scale are derived from this simulated transition; flat scenarios also follow the shared synthetic oscillation so that the signal continues to change; the page labels them as automatically generated from the administrator's scenario, not actual market information. Drift is smoothly bounded (±0.25 log-price relative to each anchor) to keep long unattended intervals finite.

The computation reconstructs only the most recent 120 candles rather than iterating across the entire elapsed time. No background browser, scheduled task or per-second database write is required: opening the page later reflects elapsed server time. The persisted anchor is authoritative; transient frames are calculated on reads and are not separate audit events. The client accepts increasing clock frames within the same configuration version, polls approximately once a second during automatic mode, and retains immediate notification-based reloads for owner commands. Delayed/duplicate frames cannot roll back the chart.

Existing saved scenes remain in manual mode until the owner presses one of the automatic direction buttons. No current public scenario was activated or rewritten during implementation or read-only production checks. New database schema, credentials, payment features or changes to the reference GitHub repository were not required.
