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
