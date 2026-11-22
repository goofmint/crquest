# Firebase の撤去と統合テスト

Issue #193 の実装。OSS Supabase への移行の最後の段階として、チーム・オペレーションの参加を Supabase に切り替え、Firebase への依存をすべて取り除いた。通常のプレイで Firebase 宛ての通信は発生しない。旧 Firebase の API の一覧は [firebase-api.md](../firebase-api.md)（撤去前の調査記録）。

## 置き換えの対応

| 旧（Firebase） | 新（Supabase） | Issue / 文書 |
| --- | --- | --- |
| `POST /quest/api/v1/user-sync` | クラウドセーブ | #187 [cloud-save.md](cloud-save.md) |
| `GET /quest/api/v1/teams/joinCode/{code}`、`operations/joinCode/{code}` | `join_group` / `leave_group` / `list_my_groups`（Rust コマンド `group_join` / `group_leave` / `group_list`） | #188 [teams-operations.md](teams-operations.md)、このIssue |
| `POST /quest/tracking/trees` | `record_tree_planting` | #191 [unlocks-and-trees.md](unlocks-and-trees.md) |
| Firestore `unlockCodes` | `redeem_unlock_code` | #191 |
| Firestore `liveEvents` / `liveEventAchievements` | 認定台帳とライブイベント RPC | #189 / #190 [live-events.md](live-events.md) |
| Firestore `missions`（Admin SDK） | `npm run sync:missions -- --target local\|remote` | #192 [mission-catalog.md](mission-catalog.md) |

## このIssueで撤去したもの

- Firebase Web SDK（`public/lib/firebase/`、`index.html` の読み込み、`src/js/app/common/firebase.js`）。
- Admin SDK（`firebase-admin` 依存、`tasks/shared/firebase.js`、`sync:missions:firestore`）。
- 旧 API のベース URL（`config.apiBaseUrl`、`local_config` の `apiBaseUrl`）。未使用になった `game-events` の通信コードも削除した（無効化済みの呼び出し点だけ残る）。
- Tauri の CSP の `firestore.googleapis.com` と `twilioquest-{prod,dev}.firebaseapp.com`。アプリ本体の通信はすべて Rust 側から行うため、Supabase の URL も CSP に加えていない。
- 旧環境変数 `FIREBASE_ADMIN_SA_JSON` / `FIREBASE_DATABASE_URL` と、それだけを載せていた `.env.template`。カタログ発行のリモート用の変数は `.env.supabase.template`。

残る「Firebase」の文字列は、履歴を述べるコメントと文書、テストが不在を確認する記述、Supabase CLI の既定 `supabase/config.toml` の第三者認証テンプレート（無効）だけである。

## チーム・オペレーションの参加（サインインとオフライン）

サーバーの所属が、チームのランキングと貢献集計の元になる。そのため、参加・離脱はサーバーの回答を正とし、ローカルのセーブ（`teams` / `operations`。クラウドセーブにも含まれる）はその結果を映す。実装は `src-tauri/src/groups/`、`src/js/app/common/groupMembership.js`。

| 操作 | サインイン済み・接続あり | サインアウト | オフライン・サーバー障害 |
| --- | --- | --- | --- |
| 参加 | サーバーが参加コードを照合し、返った ID・表示名をローカルに保存する | 何も送らず、参加しない（「サインインしてください」） | 参加しない（再試行できる） |
| すでにサーバーで所属中（ローカルのセーブが失われた場合） | `list_my_groups` から参加コードの一致するものを復元する | - | - |
| 離脱 | サーバーが確認してからローカルの項目を消す。サーバーに所属がなければローカルだけを消す | 項目を残し、サインインを促す | 項目を残し、再試行できる |
| 旧バックエンドで保存した項目（ID が UUID でない） | サーバーに所属はないので、ローカルだけを消す | 同左 | 同左 |

サインアウト中やオフライン中の離脱を保留にするのは、ローカルだけを消すとサーバー側の所属が残り、本人が離脱できない「孤児」になるためである。ローカルのゲーム（進行、アイテム、設定）はこの制約を受けない。

トークンとユーザー ID は JS に渡らない。JS は認証状態の不透明な識別子（`account`）だけを渡し、別のアカウントでサインインしていれば Rust が送信前に `account_changed` で拒否する。エラーは固定の英小文字コード（`invalid_join_code` など）だけで、サーバーの文言や参加コードはログに残さない。

## Firebase 参照の再発防止

- `npm run check:firebase`（`tasks/check_firebase.js`）: ホスト名、旧 API の URL とパス、SDK、旧環境変数、依存パッケージ名を走査する。`src/test/tasks/firebaseRemoval.test.js` が `npm test` から同じ走査を実行する。
- `src/test/app/platform/tauri/tauriBoot.test.js`: 実バンドルを jsdom で起動し、`fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` の発信が 0 件で、サーバー向けの Rust コマンド（`cloud_save_*` など）も呼ばれないことを確認する。

## 統合テストの再現

```bash
npm ci
npm run supabase:start          # Docker が必要
npm run supabase:integration    # reset → pgTAP → sync:missions --target local → smoke → catalog-check → Rust の統合テスト
npm run supabase:stop
```

`supabase:integration` は `supabase status` の API URL がループバックでなければ中止する。`--skip-reset` でリセットを省ける。キーは環境変数でだけ Rust のテストに渡し、ログに出さない。テストデータはすべて合成データ（`example.test` / `terminalquest.invalid` の使い捨てユーザー、実行ごとのランダムなグループとコード、seed の `TQ-TEST-*`）で、実行後に作ったものを削除する。

| 観点 | 主な検証 |
| --- | --- |
| RLS・分離・公開データの絞り込み | pgTAP 全 8 ファイル（直接のテーブルアクセスの拒否、他ユーザーの操作の拒否、公開 RPC が返す項目）、スモークの `expectPublicOnly` |
| 再送・同時提出 | pgTAP（認定・解除コード・植樹の冪等）、Rust の統合テスト（解除コードと植樹の再送、チーム参加の同時 2 回で 1 回だけ成功） |
| ログイン後の同期・復元 | `cloud_save_local_supabase`（別デバイスでの取得）、`auth_local_supabase` |
| チーム参加・離脱 | `groups_local_supabase`（Rust の実サービスから実 DB まで）、スモークの `checkGroups` |
| 達成認定・ランキング・カタログ | スモーク、`supabase:catalog-check` |
| 解除コード・植樹 | `unlocks_trees_local_supabase` |
| オフライン起動・既存のオフライン機能 | `npm test`（起動ハーネスを含む）。Supabase を起動せずに通る |

## 手動確認

実プロバイダーとの OAuth の往復は自動化していない。手順は [auth.md](auth.md) の「手動確認: OAuth の往復」。続けて、ログイン状態で次を確認する。

1. 運用者が作ったチーム（SQL か service role で `groups` に作成。例は [teams-operations.md](teams-operations.md)）の参加コードを、Settings のチーム欄に入力して参加できる。再起動後も表示が残る。
2. 存在しないコードで「このチームは存在しません」、サインアウト中は「サインインしてください」になる。
3. ネットワークを切って離脱を押すと項目が残り、メッセージが出る。接続を戻して離脱できる。
4. 通常のプレイ中（サインアウト・オフライン含む）に、OS のネットワーク監視（`tcpdump` や Little Snitch など）で `firebaseapp.com` / `googleapis.com` 宛ての通信がないことを確認する。

## 検証記録

- 日付: 2026-11-22。ベース: `ecf164f` の作業ツリー（未コミット）。Linux arm64（サンドボックス）、Node v26.13.1、Docker 29.10.0、Supabase CLI 3.2.0。
- `npm run supabase:integration`: 全 8 手順が成功（pgTAP 8 ファイル・311 件、`sync:missions --target local` で 12 ミッション・97 目標、スモーク、カタログ検証、Rust の統合テスト 4 本）。
- `npm test`: 115 ファイル・2728 テスト成功。`cargo test`: 140 件成功（統合テスト 4 本は `--ignored` で別実行）。`cargo fmt --check`、`npm run check:firebase`: 問題なし。
- 未確認: 実プロバイダーとの OAuth の往復、実アプリ（`tauri dev`）の通信の観測、配布版の `terminalquest://` コールバック（いずれも上記の手動確認）。
