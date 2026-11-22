# universal-analytics と firebase の扱い (Phase 8: #53)

アプリは起動して確認していない (ビルドと Jest のみ)。

## universal-analytics: 削除した

根拠
- Universal Analytics は 2023-07-01 にデータ処理を停止している (サービスとして使えない)。
- `src/js/app/common/analytics.js` では、`pageview` の `visitor.pageview(...).send()` と `event` の `visitor.event(...).send()` が以前からコメントアウトされている。`ua(...)` で作った `visitor` に対して `set(...)` を呼ぶだけで、ネットワークには何も送っていなかった。`visitor` を参照する箇所は、コメントアウトされた行以外にアプリにも同梱コンテンツにも無い。
- つまり実行時の挙動は、依存を外しても変わらない。

変更
- `public/package.json` から `universal-analytics` を削除し、`public/package-lock.json` を (npm 6、lockfileVersion 1 のまま) 再生成した。
- `analytics.js` から `ua` の import、UA の ID (`UA-135538733-*`) と dev/prod の切り替え、`visitor`、`userAgent` を削除した。

維持したもの
- `analytics` の API (`initializeAnalytics`、`analyticsId`、`appVersion`、`pageview`、`event`)。UI (`ga.pageview` / `ga.event`)、`gameEvents`、バリデーターの `helper.analyticsId`、同梱コンテンツの `world.analytics.event(...)` が使うため。`pageview` と `event` は何も送らない no-op のまま (代替の計測サービスには移行していない)。
- ユーザーの GUID と `googleAnalyticsId` の移行 (`user.js`)。`analyticsId` として設定画面に表示され、バリデーターにも渡される。

ユーザーに見える変化: なし。設定画面の ID 表示、イベント呼び出しの成否ともに従来と同じ。`analytics.visitor` は消えたが、参照するコードは無い。

## firebase: 変更しない

- npm の `firebase` パッケージは `package.json` に無い。レンダラーは `public/lib/firebase/firebase-app.js` と `firebase-firestore.js` (同梱の 6.2.3、`index.html` の通常の `<script>`) を使い、グローバルの `firebase` を `src/js/app/common/firebase.js` が初期化する。
- 使用中の機能: アンロックコード (`UnlocksTab.jsx`、`unlockCodes`)、ライブイベント (`Validator.jsx`、`liveEvents` / `liveEventAchievements`)、ユーザーデータの同期 (`context/sync.js`)。いずれも実行時に Firestore を呼ぶ。
- `firebase-admin` (ルートの dependencies) は `tasks/shared/firebase.js` が使い、`tasks/create_release.js` と `tasks/sync_missions/index.js` が読み込む。リリースとミッション同期のスクリプトなので残す。
- Firestore のプロジェクト (`twilioquest-prod` / `twilioquest-dev`) が今も稼働しているかは、リポジトリからは確認できない。稼働していない場合、アンロックコードやライブイベントは失敗する。それは従来からの挙動で、この変更では変えていない。サービスの停止が確認できた場合は、別チケットで機能ごと除去するのが適切である。

## 解除コードと植樹送信の Firebase 依存を外した (#191)

- アイテムの解除コード（`UnlocksTab.jsx`）は、Firestore の `unlockCodes` を照会しなくなった。Supabase の `redeem_unlock_code` で、ログイン中のユーザーごとにサーバーで照合して付与する。
- 植樹の進捗の 3 経路（Fog Owl と Developer Fundamentals の目標の `validator.js`、Earth Day の `events/trees.js`）は、`https://twilioquest-prod.firebaseapp.com/quest/tracking/trees` へ POST しなくなった。`helper.recordTreePlanting()` / `world.recordTreePlanting()` が、Supabase の `record_tree_planting` で記録する。
- これにより、解除コードと植樹送信に Firebase への依存は残っていない。残る Firestore の利用は、ライブイベント（`Validator.jsx`）とユーザーデータの同期（`context/sync.js`）。
- 挙動の変化: 植樹の目標の完了は通信結果に左右されない（以前は Firebase の応答で決まっていた）。方針と制約は [docs/supabase/unlocks-and-trees.md](../supabase/unlocks-and-trees.md)。
