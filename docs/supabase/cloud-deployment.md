# Supabase Cloud へのデプロイ

ローカルで検証したマイグレーションと Edge Functions を Supabase Cloud（ステージング／本番）に展開する手順（#194）。アプリのビルドや開発に Supabase Cloud は不要である。

## 構成

| パス | 内容 |
| --- | --- |
| `tasks/supabase_deploy/index.js` | デプロイ本体。`npm run deploy:supabase` |
| `tasks/supabase_deploy/verify.js` | デプロイ後の読み取り専用の確認。`npm run deploy:supabase:verify` |
| `.github/workflows/supabase-deploy.yml` | 手動実行（`workflow_dispatch`）のみのワークフロー |

固定した Supabase CLI（`3.2.0`、`npx supabase`）の実機ヘルプで次を確認している。`db push` と `migration list` は `--remote`（リンク先）を取る。`--dry-run`、グローバルの `--yes` が使える。`--include-seed` は指定しない限り無効。`functions deploy` の `--no-verify-jwt` と `--prune` も指定しない限り無効。

## 安全装置

デプロイタスクは、次の条件がすべて満たされるまで CLI を一切起動しない。

- `--env staging|production` が必須で、環境変数 `TERMINALQUEST_DEPLOY_ENVIRONMENT` と一致する（GitHub Environment ごとに設定するので、ステージングの指定で本番の環境を使う取り違えを検出する）。
- `--project-ref` が英小文字 20 文字で、環境変数 `SUPABASE_PROJECT_REF` と一致する。
- `SUPABASE_ACCESS_TOKEN` と `SUPABASE_DB_PASSWORD` が設定されている。
- 本番は `--confirm-project-ref` に同じ ref を再入力する。

また、次を守る。

- seed は適用しない（`--include-seed` を渡さない。`supabase/seed.sql` は合成データでありクラウドに入れない）。
- JWT 検証は有効のまま（`--no-verify-jwt` を渡さない。`config.toml` の `[functions.health] verify_jwt = true`）。
- `--prune` を使わない（リモートにだけある関数を消さない）。
- 資格情報は環境変数だけで渡し、引数・ログには出さない。

## 資格情報とシークレット

project ref と資格情報はリポジトリに書かない。GitHub の Settings > Environments で `staging` と `production` を作り、それぞれに設定する。

| 種別 | 名前 | 内容 |
| --- | --- | --- |
| Variable | `TERMINALQUEST_DEPLOY_ENVIRONMENT` | その環境の名前（`staging` または `production`） |
| Variable | `SUPABASE_PROJECT_REF` | その環境の Supabase プロジェクトの ref（20 文字） |
| Variable | `SUPABASE_PUBLISHABLE_KEY` | その環境の publishable キー（クライアント用の公開キー。デプロイ後の確認に使う） |
| Secret | `SUPABASE_ACCESS_TOKEN` | Supabase の個人アクセストークン（ダッシュボードの Account > Access Tokens）。マイグレーションと関数をデプロイできる権限を持つ運用者のもの |
| Secret | `SUPABASE_DB_PASSWORD` | その環境のデータベースパスワード（Project Settings > Database） |

本番の Environment には、Required reviewers と、デプロイを許可するブランチ（`main`）の制限を設定する。プランやリポジトリの公開範囲によっては使えないため、上記の再入力による確認がコード側の最終防衛線になる。

サーバー専用の値（secret キー、DB パスワード、アクセストークン）は `src/js/`、`public/`、`VITE_` 接頭辞の環境変数、Tauri のリソースに置かない（[local-development.md](local-development.md)）。

## ローカル検証（デプロイ前に必須）

```bash
npm test
npm run check:platform
npm run check:firebase
npm run supabase:start
npm run build:tauri              # Rust の統合テストのコンパイルに tauri-dist が必要
npm run supabase:integration     # db reset、pgTAP、スモーク、Rust の統合テスト（Docker が必要）
npm run supabase:stop
```

GitHub Actions では `verify-local` ジョブが同じ内容を実行し、成功しない限り `deploy` ジョブは始まらない。

## 環境ごとの適用順序

ステージングで確認してから本番に進める。

1. ステージングで dry-run（既定）を実行し、適用されるマイグレーションの一覧を確認する。
2. ステージングで本実行する（`dry_run` を外す）。デプロイ後の確認が自動で走る。
3. 手動の手順（下記「データの公開」「認証の設定」）をステージングで済ませ、アプリを接続して確認する。
4. 本番で 1 から 3 を繰り返す。

1 回のデプロイ内の順序は固定である: `link`、`migration list --remote=<ref>`、`db push --remote=<ref> --dry-run`、`db push --remote=<ref> --yes`、`functions deploy <各関数> --remote=<ref> --yes`（値なしの `--remote` は環境変数や古いリンクの対象になり得るため、検証済みの ref を明示する）。dry-run のみのときは `db push --dry-run` で止まる。デプロイする関数は `supabase/functions/` 直下のディレクトリから決める。

### GitHub Actions から

Actions の「Supabase Deploy」を Run workflow から実行する。

- `environment`: `staging` か `production`
- `project_ref`: 対象の ref（環境の `SUPABASE_PROJECT_REF` と一致しないと失敗する）
- `confirm_project_ref`: 本番のみ。ref をもう一度入力する
- `dry_run`: 既定は true。差分の確認だけで適用しない

### ローカルから

```bash
export TERMINALQUEST_DEPLOY_ENVIRONMENT=staging
export SUPABASE_PROJECT_REF=<ref>
export SUPABASE_ACCESS_TOKEN=<token>
export SUPABASE_DB_PASSWORD=<password>

npm run deploy:supabase -- --env staging --project-ref <ref> --dry-run
npm run deploy:supabase -- --env staging --project-ref <ref>
# 本番
npm run deploy:supabase -- --env production --project-ref <ref> --confirm-project-ref <ref>
```

`supabase link` が `supabase/.temp/`（git 管理外）にリンク先を書く。別の環境に切り替えるときは、環境変数を変えて同じコマンドを実行すれば再リンクされる。

## デプロイ後の確認

```bash
export TERMINALQUEST_SUPABASE_URL=https://<ref>.supabase.co
export TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY=<publishable key>
export SUPABASE_PROJECT_REF=<ref>
npm run deploy:supabase:verify
```

読み取りだけを行う。サインアップや書き込みはしない（`supabase:smoke` と `supabase:catalog-check` は書き込むため、クラウドには使わない）。

- `GET /auth/v1/health` が 200
- トークンなしの `GET /functions/v1/health` が 401（ゲートウェイの JWT 検証が効いている）
- `GET /rest/v1/missions` が 200（空なら「カタログ未公開」と表示する。次の「データの公開」を行う）
- `POST /rest/v1/rpc/list_live_events` が 200
- `TERMINALQUEST_REMOTE_CHECK_ACCESS_TOKEN`（有効なユーザーのアクセストークン）を設定した場合だけ、ベアラー付きの `health` が 200 で `{"ok":true}` を返すことも確認する

URL は `https` で、ホストが `<ref>.supabase.co` のときだけ送信する。

## データの公開（手動・ワークフロー対象外）

マイグレーションと Edge Functions だけがワークフローの対象である。カタログと解除コードの公開は既存データの退役・削除を伴い、解除コードはリポジトリ外の承認済みファイルが必要なため、運用者が環境を確認したうえで手動で実行する。

```bash
export TERMINALQUEST_CATALOG_SUPABASE_URL=https://<ref>.supabase.co
export TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY=<その環境の secret キー>
npm run sync:missions -- --target remote
npm run sync:unlock-codes -- --target remote --file <リポジトリ外のJSON>
```

詳細は [mission-catalog.md](mission-catalog.md) と [unlocks-and-trees.md](unlocks-and-trees.md)。ステージングの値で実行したあと、本番の値で実行する。

## 認証の設定（ダッシュボード・手動）

`config.toml` の `[auth]`（`site_url`、`additional_redirect_urls`、プロバイダー）はローカルスタック用であり、`db push` と `functions deploy` ではクラウドに反映されない。環境ごとに次をダッシュボードで設定する。

1. Authentication > URL Configuration の Redirect URLs に `terminalquest://auth/callback?attempt=*` を追加する。広いワイルドカードは追加しない。デスクトップアプリなので Site URL は使われないが、既定のままだと誤解を招くため、公開しているドキュメントなどの HTTPS の URL にしておく。
2. Authentication > Providers で GitHub と Google を有効にし、クライアント ID とシークレットを入力する。各 OAuth アプリには、そのプロジェクトのコールバック URL `https://<ref>.supabase.co/auth/v1/callback` を登録する。OAuth アプリは環境ごとに分ける（ステージングと本番で同じアプリを共有しない）。
3. 設定後、[auth.md](auth.md) の手順でインストーラーまたはパッケージからのログインを確認する。

## Tauri の接続先と CSP

- 接続先はビルド時の環境変数で決まる（`src-tauri/src/auth/config.rs` の `option_env!`）。`TERMINALQUEST_SUPABASE_URL` と `TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY` を設定してビルドする。レンダラーは接続先を指定できない。
- リリースビルドは `https` の URL だけを受け付ける。URL が未設定のリリースビルドは接続先なし（ログイン無効）で、ゲームは動く。キーに publishable キー以外（secret キー）を使わない。
- ステージング用と本番用でビルドを分け、それぞれの環境の値を渡す。

```bash
TERMINALQUEST_SUPABASE_URL=https://<ref>.supabase.co \
TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
  npm run release
```

- CSP（`src-tauri/tauri.conf.json` の `connect-src`）の変更は不要である。Supabase への通信は Rust 側が行い、レンダラーは Supabase に直接接続しない。

## サーバー用シークレット

- 現在の `health` 関数はシークレットを使わない。関数が必要とするシークレットは `npx supabase secrets set --env-file <未コミットのファイル> --remote=<ref>` で環境ごとに設定する（`<ref>` は対象環境の project ref。`SUPABASE_URL` などの組み込み変数は設定不要）。
- secret キーは `sync:*` の運用タスクだけが使う。クライアントのビルドやワークフローの `deploy` ジョブには渡さない。
- OAuth プロバイダーのクライアントシークレットはダッシュボードに入力する。リポジトリや Actions には置かない。

## マイグレーション失敗時の復旧

`db push` は 1 つのマイグレーションを 1 トランザクションで適用するため、失敗したマイグレーションは途中まで反映されない。それより前に成功したものは適用済みのまま残る。

1. ワークフローのログ、または `npx supabase migration list --remote=<ref>` で、履歴上どこまで適用されたかを確認する（`<ref>` は対象環境の project ref）。
2. 履歴だけでなく実際の DB の状態も確認する（ダッシュボードの Table Editor / SQL Editor で、失敗したマイグレーションが作るはずのテーブル・関数・権限が存在しないか）。トランザクション外で実行される文（`CREATE INDEX CONCURRENTLY` など）や手作業の SQL により一部だけ反映されていた場合は、その変更を解消してから再実行する。
3. 原因を修正する。**適用済みのマイグレーションファイルは書き換えない**。新しい（より新しいタイムスタンプの）マイグレーションで修正する。まだどの環境にも適用されていないファイルだけは直してよい。
4. 失敗の原因が既存データ（制約違反など）にある場合は、本番のデータ状態を調べ、原因に応じて修正内容を判断する。修正前にバックアップ（Database > Backups）の存在と影響範囲を確認し、まずステージングで同じ手順を試す。
5. 履歴と実際の状態がずれたとき（失敗したバージョンが履歴上は適用済みになっている、手作業で SQL を実行した、など）は、実際の状態に合わせて `npx supabase migration repair <version> --status reverted --remote=<ref>`（未適用に戻す）または `--status applied` で履歴を合わせる。実行前に `<ref>` が修復対象の環境の project ref と一致すること（GitHub Environment の `SUPABASE_PROJECT_REF`、ダッシュボードの URL）を確認する。
6. ローカルで `npm run build:tauri` と `npm run supabase:integration` を通し、ステージングで dry-run からやり直す。dry-run が履歴の不整合で失敗した場合は、手順 5 の履歴修復を行ってから dry-run を再実行する。
7. データを壊す変更を本番に適用する前は、ダッシュボードのバックアップ（Database > Backups）の存在を確認する。リストアは Supabase のバックアップ機能で行い、このリポジトリのツールは破壊的な巻き戻しを提供しない。
8. Edge Function のデプロイだけが失敗した場合は、マイグレーションは適用済みである。原因を直して同じワークフローを再実行する（マイグレーションは差分がなければ何もしない）。

## 範囲外・未検証

- 実際のクラウドプロジェクトへのデプロイは、このリポジトリの検証では行っていない（資格情報がないため）。引数と環境の検証、手順の順序、ワークフローの構成は、サブプロセスと HTTP を差し替えた単体テスト（`src/test/tasks/supabaseDeploy.test.js`）で確認している。初回は必ずステージングの dry-run から始める。
