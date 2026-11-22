# ローカル Supabase 基盤の検証記録

Issue #185 の実装を、ローカルの Docker 上で検証した記録。`supabase status` の出力、キー、トークンは記録していない。

## 環境

- コミット: `78a91c3`（ブランチ `feature/issue-185-supabase-foundation` の作業ツリー、未コミットの変更を含む）
- OS: Linux 7.0.14（サンドボックス）
- Node v26.13.1、npm 12.2.3、Docker 29.10.0
- Supabase CLI 3.2.0（ルートの `devDependencies` に完全一致で固定）
- `project_id`: `terminalquest`。ほかの Docker プロジェクトは停止もリセットもしていない（検証時点で動いていたコンテナはなかった）

## 結果

| コマンド | 終了コード | 結果 |
| --- | --- | --- |
| `npm run supabase:start` | 0 | 12 コンテナが起動し、マイグレーションとシードを適用 |
| `npm run supabase:reset`（2 回） | 0 / 0 | 再作成、マイグレーション、シード、コンテナ再起動が成功 |
| `npm run supabase:test` | 0 | `seed_and_privileges.test.sql`: 13 件すべて成功 |
| `npm run supabase:smoke` | 0 | Auth のヘルス、サインアップ、トークンなしの health 関数 401、トークン付きで 200 |
| `npm run supabase:stop` | 0 | コンテナなし |
| `npm test` | 0 | 91 ファイル、2365 テスト成功（Supabase の配線テスト 13 件を含む） |
| `npm run check:platform` | 0 | 違反なし |

確認できたこと:

- `supabase start` は Edge Functions を自動で提供する。`supabase functions serve` を別に実行しなくても、`health` 関数はスモーク検証で 401 / 200 を返した。
- `supabase test db` はテストファイルをトランザクションで包まない。そのため各ファイルに `BEGIN` と `ROLLBACK` を明示している。
- `supabase db reset` はローカルのみを対象にし、2 回続けて実行しても成功した。

## 未検証・制約

- `public.ecr.aws` のイメージ取得時に、`d5l0dvt14r5h8.cloudfront.net` への一部リクエストがネットワークポリシー（承認待ち）で 403 になった。CLI の再試行で `ghcr.io` のミラーにフォールバックし、最終的にすべて取得できた。
- イメージの一部は最初の試行でキャッシュ済みだった。`node_modules` を削除した状態からの `npm ci` は実行していない（CLI は `npm install --save-exact` で導入し、`npx supabase` で起動を確認した）。
- `npm run build` は実行していない。`supabase/` と `tasks/supabase_smoke/` は `src/` と `public/` の外にあり、ビルド対象に入らない。
- `npm run supabase:functions` 単体の動作、Studio の画面、ホスト側のプロジェクトへの接続は確認していない。

## チーム・オペレーション（Issue #188）の検証記録

ブランチ `feature/issue-188-teams`（未コミットの作業ツリー）で、ローカルの Docker 上で検証した。キーとトークンは記録していない。

| コマンド | 結果 |
| --- | --- |
| `npm run supabase:reset` | マイグレーション 3 本とシードを適用して成功 |
| `npm run supabase:test` | `groups_and_contributions.test.sql` 46 件を含む全ファイル成功（cloud_saves、seed_and_privileges、groups_and_contributions） |
| `npm run supabase:smoke` | 実 JWT の 2 ユーザーで、トークンなし拒否、有効／無効コード、重複加入、一覧、他ユーザーの離脱と集計の拒否、本人の離脱、テーブル直接アクセスの拒否を確認 |
| `npm test` | 成功 |
| `npm run check:platform` | 違反なし |

未検証: HTTP 経由の集計は、台帳へクライアントが書けないため 0 点の確認のみ。集計の中身は pgTAP で検証した。参加コードの総当たり対策（RPC 単位の試行回数制限）は未実装。

## 認定 API（Issue #189）の検証記録

ローカルの Docker 上で検証した。キーとトークンは記録していない。手順と契約は [certification.md](certification.md)。

| コマンド | 結果 |
| --- | --- |
| `npm run supabase:reset` | マイグレーション 5 本とシードを適用して成功 |
| `npm run supabase:test` | `challenge_certification.test.sql` 52 件を含む全ファイル成功 |
| `npm run sync:missions -- --target local`（2 回） | 初回: 検証定義 inserted=3、2 回目: unchanged=3 |
| `npm run supabase:smoke` | 実 JWT で、権限、正解、不正解、再送、同時提出（同一チャレンジ、同一目標の別チャレンジ）、グループの 0 以外の貢献点を確認 |

未検証: 期限切れは pgTAP のみ（待機が必要なため HTTP では確認しない）。チャレンジの発行回数の上限と期限切れ行の削除は未実装。クライアント（Rust / `Validator.jsx`）への組み込みは範囲外。

## ライブイベントと公開ランキング（Issue #190）の検証記録

ローカルの Docker 上で検証した。キーとトークンは記録していない。規則は [live-events.md](live-events.md)。

| コマンド | 結果 |
| --- | --- |
| `npm run supabase:reset` | マイグレーション 6 本とシードを適用して成功 |
| `npm run supabase:test` | `live_events.test.sql` 62 件を含む全ファイル成功（`sync:missions` の前に実行する） |
| `npm run sync:missions -- --target local` | カタログと検証定義を発行（スモークの前提） |
| `npm run supabase:smoke` | 実 JWT で、匿名の読み取り、匿名の参加拒否、下書き・終了済み・不正な表示名・二重参加の拒否、表示・非表示の参加、直接アクセスの拒否、認定 RPC で得た加点とイベントのスコア・順位・チーム得点の一致、公開列の確認、認定済み目標の再発行拒否（スコア不変）を確認 |
| `cargo test`（`live_events`） | Rust 単体テスト（偽の access / remote。トークンなしの公開読み取り、別アカウント時に remote へ到達しないこと、エラー変換、応答の解析） |

未検証: Rust の `HttpRemote` を実スタックへ向けた統合テストは追加していない（応答の解析は単体テストと、同じ RPC を呼ぶスモークで確認）。期間境界と将来時刻は特権側の台帳投入を使う pgTAP のみで、HTTP では確認しない（待機が必要で、台帳への書き込み主体が認定 RPC だけのため）。Validator の初回達成から認定を呼ぶ接続は範囲外。UI の目視確認（実アプリ起動）は行っていない。
