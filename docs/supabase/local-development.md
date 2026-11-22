# ローカル Supabase 開発環境

Issue #185 で用意した、OSS Supabase のローカルスタックと DB マイグレーションの基盤。Postgres、Auth、Edge Functions を Docker 上で動かす。通常のアプリのビルド、テスト、実行には不要で、`npm test`、`npm run build`、`npm start` は Supabase なしで動く。

## 前提条件

- Docker 互換ランタイム（Docker Desktop、OrbStack、Colima など）が動いていること。
- Node 26 と npm 11 以上（`.nvmrc` を参照）。
- Supabase CLI はルートの `devDependencies` で `3.2.0` に完全一致で固定している。`npm ci` / `npm install` 時に、プラットフォーム別のバイナリパッケージ（`@supabase/cli-*`）が取得される。グローバルインストールは不要で、`npx supabase ...` または下記の `npm run supabase:*` を使う。
- 初回の `supabase start` は Docker イメージを取得するため時間がかかる。ネットワークが `ghcr.io` と `public.ecr.aws` に届く必要がある。
- 使用ポート: 54321（API）、54322（DB）、54323（Studio）、54324（メール確認用 Mailpit）ほか。衝突する場合は `supabase/config.toml` のポートを変更するか、競合するプロセスを止める。`project_id` は `terminalquest` で、コンテナ名にこの値が付く。ほかの Supabase プロジェクトのコンテナとは区別される。

## 手順

| 目的 | コマンド |
| --- | --- |
| 起動 | `npm run supabase:start` |
| 状態と接続情報の確認 | `npm run supabase:status` |
| DB を再作成（マイグレーションとシードを再適用） | `npm run supabase:reset` |
| pgTAP による DB テスト | `npm run supabase:test` |
| スモーク検証（Auth と Edge Function） | `npm run supabase:smoke` |
| 停止（データは保持） | `npm run supabase:stop` |
| 停止してデータも削除（完全な初期化） | `npx supabase stop --no-backup` |

- 空の環境からは `npm ci` → `npm run supabase:start` → `npm run supabase:reset` → `npm run supabase:test` → `npm run supabase:smoke` の順に実行する。
- `supabase:reset` はローカル専用で、`--remote` や `--linked` を付けない。ホスト側のプロジェクトを対象にしてはいけない。
- Edge Functions は `supabase start` が `supabase/functions/` の関数を自動で提供する。`health` 関数は `http://127.0.0.1:54321/functions/v1/health` で呼べる。ホットリロードしながら開発する場合や、`supabase/functions/.env` を読み込ませたい場合は `npm run supabase:functions` を別ターミナルで実行する。
- `supabase test db` は各テストファイルをトランザクションで包まない。`supabase/tests/database/` の各ファイルは、明示的な `BEGIN` と `ROLLBACK`、`plan()`、`finish()` を持つ。
- `supabase status` の出力にはキーが含まれる。共有、貼り付け、コミットをしない。

## 構成

| パス | 内容 |
| --- | --- |
| `supabase/config.toml` | `supabase init` で生成した設定。`project_id` と `[functions.health]` だけを調整した |
| `supabase/migrations/` | マイグレーション。`20261122071325_initial_privileges.sql` は権限の初期設定のみ |
| `supabase/seed.sql` | 合成シード。`db reset` のたびに同じ内容を投入する |
| `supabase/functions/health/` | JWT 検証を有効にした最小の Edge Function |
| `supabase/tests/database/` | pgTAP テスト |
| `tasks/supabase_smoke/` | Auth と Edge Function のスモーク検証 |
| `.env.supabase.template` | 環境変数テンプレート（`.env.supabase.local` にコピーして使う） |

合成シードの `auth.users` 3 件（UUID `00000000-0000-4000-8000-00000000000N`、メールは `example.test`）は、パスワードを持たないプレースホルダーである。サインインには使えない。ログインが必要な検証は、スモーク検証のように Auth API で都度ユーザーを作る。実在のセーブデータ、GUID、Firebase のデータは入れない。

## クライアント用キーとサーバー専用の資格情報

接続情報は `npx supabase status -o env` で得る。変数名は `--override-name` で変更できる。値は `.env.supabase.template` を `.env.supabase.local`（git 管理外）にコピーして書く。

| 種別 | 値 | 置いてよい場所 |
| --- | --- | --- |
| クライアント | API URL、publishable キー（旧名 `ANON_KEY`）、ユーザーのセッション | アプリのクライアントコード。RLS で守られる前提で、公開されても権限を超えない |
| サーバー専用 | secret キー（旧名 `SERVICE_ROLE_KEY`）、DB 接続 URL、`JWT_SECRET` | `tasks/` のスクリプト、Edge Function の環境、`supabase/functions/.env`（git 管理外）に限る |

次の場所にはサーバー専用の値を置かない。

- `src/js/`、`public/`、`local_config.js`
- `VITE_` 接頭辞の環境変数（Vite がクライアントの成果物に埋め込む）
- Tauri のリソースディレクトリ

ローカルスタックが生成するキーは、ホストされた Supabase プロジェクトのキーとは別物である。ホスト側の secret キーや、将来の外部 OAuth プロバイダーの秘密情報は `config.toml` に直接書かず、`env(NAME)` 参照で扱う（例: `secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"`）。値は git 管理外の環境変数で渡す。

## 権限方針（RLS 前提）

`initial_privileges` マイグレーションは、`postgres` が `public` スキーマに作成する将来のテーブル、シーケンス、関数について、`anon` と `authenticated` への既定権限を取り消す。あわせて、`postgres` が作成する将来の関数の `PUBLIC` への `EXECUTE` も取り消す。`service_role` の既定権限、`public` スキーマに対する `USAGE`、`auth` / `storage` / `realtime` スキーマ、`supabase_admin` の既定権限は変更しない。製品テーブルは作らない。

後続の機能マイグレーション（#186 以降）は次の規約に従う。

1. テーブル作成後、すぐ `ENABLE ROW LEVEL SECURITY` する。
2. 必要最小限の `GRANT` だけを、必要なロールに明示的に付ける。
3. `auth.uid()` によるポリシーを書く（`user_id = (select auth.uid())` の形）。
4. RPC（関数）には、呼び出させるロールへの `EXECUTE` を明示的に `GRANT` する。
5. pgTAP で、許可される操作と拒否される操作の両方をテストする。`service_role` とテーブル所有者は RLS を迂回するため、RLS の確認には使わない。

`supabase/tests/database/seed_and_privileges.test.sql` に、使い捨てテーブルによる既定権限と所有者ポリシーのテスト例がある。

## 範囲外

- Tauri の CSP `connect-src` の変更とクライアント接続は #186 / #187 で行う。
- GitHub / Google などの OAuth プロバイダー、`site_url`、リダイレクト許可リストは #186 で設定する。現在の `[auth]` は生成時の既定値のまま（匿名サインインは無効、メールサインアップは有効で確認なし）で、スモーク検証のために維持している。
- 製品スキーマ（セーブ、チーム、実績など）は各 Issue が担当する。

検証の記録は [verification.md](verification.md) を参照。
