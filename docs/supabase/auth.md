# ログイン（GitHub / Google）とセッション管理

Issue #186 の実装。TerminalQuest（Tauri）に、任意の GitHub / Google ログインを追加した。ログインしなくても、オフラインでも、ゲームはこれまでどおり遊べる。メール入力、メールログイン、手動のプロバイダー連携画面はない。

## 仕組み

- 認証の処理は Rust 側（`src-tauri/src/auth/`）にまとめている。Supabase Auth の REST API を直接呼ぶ（`supabase-js` は使わない）。
- ログインはシステムブラウザーで行う。PKCE（S256）を使い、コールバックはカスタム URL スキーム `terminalquest://auth/callback?attempt=<nonce>` でアプリに戻る。
  - 起動中のアプリには `tauri-plugin-single-instance`（`deep-link` 機能付き）と `tauri-plugin-deep-link` が URL を渡す。コールドスタートでは `get_current()` が URL を返す。
  - コールバックは、スキーム、ホスト、パス、`attempt`（試行ごとのノンス）が保留中の試行と完全に一致した場合だけ処理する。一致しない URL は何も言わずに捨てる。1 つの試行は 1 回だけ使える（重複したコールバックは無視される）。新しいログインを始めると古いノンスは無効になる。保留中の試行は約 10 分で期限切れになる。
- 保存するもの:
  - OS の資格情報ストア（macOS Keychain、Windows Credential Manager、Linux Secret Service）にリフレッシュトークン、ユーザー ID、プロバイダー、表示名を保存する。保留中の試行（検証コード、ノンス）も別のエントリーに保存する。
  - アクセストークンはメモリだけに置く。
  - 資格情報ストアが使えない場合は、セッションをその実行中のメモリにだけ置き、Account 画面に通知する（平文の代替保存はしない）。
- レンダラーに渡すのは秘密情報を含まない状態だけ（`state`、`provider`、`displayName`、`offline`、`persistence`、`errorCode`）。トークン、検証コード、`code`、ユーザー ID は、レンダラー、`setContext`、`env`、`config.json`、ログ、エラーメッセージに入れない。トークンを読み出すコマンドはない。ローカルの GUID と Supabase のユーザー ID は結び付けない（#187 で決める）。
- 状態: `restoring`（起動時、バックグラウンド）、`signed_out`、`pending`、`signed_in`、`expired`、`error`、`unconfigured`。
  - 起動時にリフレッシュトークンで更新する。ネットワーク障害なら、トークンを保持したまま `signed_in`（`offline: true`）とし、1 分後に再試行する。サーバーに拒否された場合は、保存したセッションを消して `expired` にする。
  - アクセストークンの期限の約 1 分前に更新する。ローテーションされた新しいリフレッシュトークンは、保存してから通知する。
  - ログアウトは、ローカルの削除、`signed_out` の通知、サーバー側の失効（`scope=local`、ベストエフォート）の順に行う。オフラインでもログアウトできる。
- UI は Settings の「アカウント」タブだけにある。タイトル画面とオンボーディングは変わらない。文言は `src/js/app/i18n/locales/{en,ja}.json` の `settings.account.*`。

### 「データを消去」との関係

セッションは OS の資格情報ストアにあり、ゲームデータ（`config.json`）とは別である。「データを消去」ではセッションは消えない。ログアウトは、Account 画面の「ログアウト」で明示的に行う。

## 接続設定（ビルド時）

接続先は Rust のビルド時環境変数で決める。レンダラーからは変えられない。

| 変数 | 内容 |
| --- | --- |
| `TERMINALQUEST_SUPABASE_URL` | Supabase の URL。デバッグビルドは未指定なら `http://127.0.0.1:54321`（ローカルスタック）。リリースビルドは `https` のみ有効 |
| `TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY` | publishable キー（旧 anon キー）。secret / service_role キーは入れない |

キーが未指定、またはリリースビルドで `https` でない場合は「未設定」になり、Account 画面にログインが使えないと表示される。ゲームは通常どおり動く。変数を変えると再ビルドされる（`build.rs` の `rerun-if-env-changed`）。

## ローカル Supabase の設定

`supabase/config.toml` の `[auth]` を次のようにしている。

- `additional_redirect_urls = ["terminalquest://auth/callback?attempt=*"]`（広いワイルドカードは使わない）
- `[auth.external.github]` と `[auth.external.google]` を有効にし、クライアント ID とシークレットは `env(SUPABASE_AUTH_EXTERNAL_<PROVIDER>_CLIENT_ID)` / `env(SUPABASE_AUTH_EXTERNAL_<PROVIDER>_SECRET)` で参照する。値は `.env.supabase.template` を `.env.supabase.local`（git 管理外）にコピーして書く。
- 認証情報がなくても `supabase start` は起動する。この場合、プロバイダーへの往復だけが失敗する。

## 自動テスト

| テスト | 内容 |
| --- | --- |
| `cargo test`（`src-tauri/`） | PKCE（RFC 7636 の例）、認可 URL、コールバック検証（スキーム、パス、ノンス不一致、重複、期限切れ）、秘密情報を含まないペイロードとエラー、オフライン更新、更新拒否、ローカル優先のログアウト、資格情報ストアなしの動作、既存の CSP テスト |
| `npm test` | プラットフォームアダプター、Account 画面の各状態、二重押下の防止、購読解除、ja / en の辞書の一致、Supabase 設定の配線 |
| 統合テスト（下記） | ローカル Supabase の Auth に対する更新、ローテーション、ログアウト、拒否時の `expired` |

### ローカル Supabase を使う統合テスト

実際の OAuth の往復は確認しない。使い捨てのユーザーをローカルの管理 API で作り、パスワードでサインインしたセッションを、メモリのストアを使うセッション管理に渡す。確認するのはトークンを得たあとの処理（復元、更新、ローテーションされたトークンの保存、ログアウト、拒否時の `expired`）で、終了時にユーザーを削除する。service_role（secret）キーはこのテストのプロセスの中だけで使う。

```bash
npm run supabase:start
eval "$(npx supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SERVICE_ROLE_KEY)=')"
TERMINALQUEST_TEST_SUPABASE_URL="$API_URL" \
TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  cargo test --manifest-path src-tauri/Cargo.toml --test auth_local_supabase -- --ignored
```

## 手動確認: OAuth の往復（資格情報がある環境）

### OAuth アプリの作成

ローカルのコールバック URL（プロバイダー側に登録する値）は `http://127.0.0.1:54321/auth/v1/callback`。

- GitHub: Settings > Developer settings > OAuth Apps > New OAuth App。Authorization callback URL に上記を登録し、Client ID と Client secret を得る。
- Google: Google Cloud Console で OAuth 同意画面を設定し、認証情報 > OAuth クライアント ID（種類: ウェブアプリケーション）を作る。承認済みのリダイレクト URI に上記を登録する。

値は `.env.supabase.local` の `SUPABASE_AUTH_EXTERNAL_{GITHUB,GOOGLE}_{CLIENT_ID,SECRET}` に書く。コミットしない。

### 手順

1. 値を環境に読み込んで起動する。
   ```bash
   set -a; . ./.env.supabase.local; set +a
   npm run supabase:start
   ```
2. アプリのビルド時設定を渡して起動する（デバッグビルドは URL を省略できる）。
   ```bash
   eval "$(npx supabase status -o env | grep -E '^PUBLISHABLE_KEY=')"
   TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" npm start
   ```
3. Settings > アカウントで「GitHub でログイン」を押す。ブラウザーが開くので、プロバイダーで許可する。アプリに戻り、「GitHub で <名前> としてログイン中」と表示されることを確認する。
4. アプリを再起動し、ログインが保たれる（資格情報ストアから復元される）ことを確認する。
5. 「ログアウト」を押し、未ログインに戻ることを確認する。
6. 「Google でログイン」で 3〜5 を繰り返す。
7. キャンセル: ブラウザーのログイン画面を閉じて、アプリで「キャンセル」を押す。未ログインに戻り、もう一度ログインできることを確認する。ブラウザーを閉じただけで待つ場合は、約 10 分で「タイムアウト」の表示になり、再試行できることを確認する。
8. 認可の拒否: プロバイダーの画面で「拒否（Cancel）」を押す。「ログインがキャンセルされたか、許可されませんでした」と表示され、「再試行」で再度ログインできることを確認する。
9. 期限切れ: ログイン後、アプリを終了し、Studio（http://127.0.0.1:54323）の Authentication > Users で該当ユーザーを削除する（リフレッシュトークンが無効になる）。アプリを再起動すると「ログインの有効期限が切れました」と表示され、再ログインできることを確認する。
10. 「データを消去」を実行してもログイン状態が残ること、ログアウトは Account 画面の操作で行うことを確認する。

## 配布版でのコールバック確認

`tauri dev` の確認は配布版の確認の代わりにならない。実際のインストーラー、またはパッケージで確認する。ビルドには、リリース用の `https` の Supabase URL と publishable キーが必要（リリースビルドはローカルの `http` を受け付けない）。ステージング用の Supabase プロジェクト、またはローカルスタックに到達できる `https` のトンネルを使う。

```bash
TERMINALQUEST_SUPABASE_URL=https://<project>.supabase.co \
TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
  npm run release
```

配布版の OAuth には、ステージング（または本番）の Supabase プロジェクトで次の設定が必要になる。

1. Supabase ダッシュボードの Authentication > URL Configuration を開く。
2. Redirect URLs（許可リスト）に `terminalquest://auth/callback?attempt=*` を追加する。これは、配布版が OAuth のあとにアプリへ戻るための許可で、ないと Supabase がリダイレクトを拒否する。広いワイルドカードは追加しない。ローカルスタックでは `supabase/config.toml` の `additional_redirect_urls` が同じ役割をする（既存のローカル手順はそのまま）。
3. Authentication > Providers で GitHub と Google を有効にし、そのプロジェクトのコールバック URL（`https://<project>.supabase.co/auth/v1/callback`）を各 OAuth アプリに登録する。

成果物は `src-tauri/target/release/bundle/` に出る。コールバックの再現（アプリが起動していない状態、または起動中に、OS から URL を開く）:

- macOS: `open 'terminalquest://auth/callback?attempt=test&code=test'`
- Windows: `start "" "terminalquest://auth/callback?attempt=test&code=test"`（PowerShell: `Start-Process 'terminalquest://auth/callback?attempt=test&code=test'`）
- Linux: `xdg-open 'terminalquest://auth/callback?attempt=test&code=test'`

実際のログインでは、保留中のノンスを持つブラウザーからのコールバックが使われる。手で作った URL はノンスが一致しないので、「偽の URL の破棄」の確認になる。

各形式で次の 4 項目を確認する。

1. コールドスタート: ログイン中（ブラウザーを開いた状態）にアプリを終了し、ブラウザーでログインを完了する。OS がアプリを起動し、ログインが完了する（保留中の試行は資格情報ストアに保存されている）。
2. 起動中: アプリが動いている状態でログインを完了する。新しいウィンドウやプロセスが増えず、既存のウィンドウがログイン済みになる。
3. 重複: 同じコールバック URL をもう一度開いても、状態が変わらず、エラーも出ない。
4. 偽の URL: 上の手で作った URL（ノンス不一致）、`terminalquest://evil/...`、パスの違う URL を開いても、状態が変わらない。

| OS | 形式 | 配置と補足 | コールドスタート | 起動中 | 重複 | 偽の URL |
| --- | --- | --- | --- | --- | --- | --- |
| macOS | `.app` | `/Applications` に配置して起動（`Info.plist` の URL スキームは、配置して一度起動すると登録される） | 未確認 | 未確認 | 未確認 | 未確認 |
| macOS | DMG | DMG から `/Applications` へコピーして確認する | 未確認 | 未確認 | 未確認 | 未確認 |
| Windows | NSIS | インストール後。スキームはレジストリに登録される | 未確認 | 未確認 | 未確認 | 未確認 |
| Windows | MSI | インストール後 | 未確認 | 未確認 | 未確認 | 未確認 |
| Linux | DEB | `dpkg -i` でインストール後。`.desktop` の MimeType でスキームが登録される | 未確認 | 未確認 | 未確認 | 未確認 |
| Linux | RPM | `rpm -i` でインストール後 | 未確認 | 未確認 | 未確認 | 未確認 |
| Linux | AppImage | インストーラーがないため、起動時に `APPIMAGE` 環境変数を見てスキームを登録する（`register_all()`） | 未確認 | 未確認 | 未確認 | 未確認 |

Linux では、キーリングに Secret Service（GNOME Keyring、KWallet など）が必要。ない環境では、ログインはその実行中だけ有効になり、画面に通知が出る。

### オフラインとログインなしの確認

- ログインなし、ネットワーク切断: ネットワークを切った状態で起動し、タイトル画面からゲームの開始、プレイまでできる。Settings > アカウントは未ログインを表示する。
- ログイン済み、ネットワーク切断: ログイン後にアプリを終了し、ネットワークを切って起動する。ゲームを遊べる。アカウントには「オフラインです」と表示され、ログインは保たれる。オンラインに戻すと自動で更新される。
- 未設定のビルド（`TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY` なし）: ゲームは通常どおり動き、アカウントに「このビルドではログインを利用できません」と表示される。

## 検証記録

実施した環境と結果。`supabase status` の出力、キー、トークンは記録していない。

| 項目 | 結果 |
| --- | --- |
| `cargo test`（`src-tauri/`、Linux arm64、rustc 1.100） | 成功（`auth` の単体テスト 32 件を含む） |
| `cargo test --test auth_local_supabase -- --ignored`（ローカル Supabase） | 成功 |
| `npm test` / `npm run check:platform` | 成功 |
| ローカル Supabase で `terminalquest://` のリダイレクトを付けた `/auth/v1/authorize` | GitHub の認可ページへ 302（資格情報は未設定） |
| GitHub / Google の OAuth の往復 | 未確認（OAuth クライアントの資格情報がない環境のため） |
| 配布版（上の表） | 未確認（macOS、Windows の実機とパッケージがない環境のため）。確認したら表を更新する |
