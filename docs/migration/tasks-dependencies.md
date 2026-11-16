# tasks/ の依存更新と release の Tauri 化 (Phase 11: #66)

## release の置き換え

- `npm run release` は `node tasks/create_release.js` から `tauri build` になった。`src-tauri/tauri.conf.json` の `beforeBuildCommand` (`npm run build:tauri`) が先にフロントエンドを作るので、別のビルド手順は要らない。`npm run ci` は `install:app` と `release` を順に実行する (以前は間に `build:all` があった。`build:all` は Electron 用の出力で、`beforeBuildCommand` が作り直す)。
- 成果物は `src-tauri/target/release/bundle/` に、実行した OS に応じた形式で出る (`bundle.targets` は `all`)。署名、公証、配布は自動化していない。
- **決定事項 (ユーザー確認待ち)**: `tasks/create_release.js` は `public/` を tar.gz にして Firebase Storage (`releases/<branch>/<version>/`) に上げ、Firestore の `releaseChannels` / `releases` を更新する、Electron 版の配布処理だった。Tauri のバンドルとは成果物の形が違い、置き換え先が無いので、公開処理ごと削除した。Tauri 版の配布 (署名、アップデーター、公開先) は別に決める必要がある。
- `tasks/shared/firebase.js` は Storage を初期化しなくなった (`bucket` の export と環境変数 `FIREBASE_STORAGE_BUCKET` を削除)。ミッション同期 (`tasks/sync_missions`) の Firestore 書き込みは変えていない。

## 削除した依存 (release 専用、または置き換え)

| パッケージ | 版 | 理由 |
| --- | --- | --- |
| `git-branch` | 2.0.1 | `create_release.js` だけが使っていた |
| `md5-file` | 4.0.0 | 同上 |
| `modclean` | 3.0.0-beta.1 | 同上 (`clean()` の呼び出しはコメントアウト済みだった) |
| `tar` | 4.4.13 | 同上 |
| `aws-sdk` | 2.681.0 | `@aws-sdk/client-polly` (v3) に置き換え |

## 更新した依存 (ルートの `package.json`)

`tasks/` だけが使うものを更新した。レンダラーが使う `pug`、`cheerio` は `public/node_modules` の版 (3.0.2、1.0.0-rc.10) が実行時とビルドに使われ (`vitest.config.mjs` の alias も同じ)、ルートの版は `tasks/` 専用なので、レンダラーの出力は変わらない (`npm run build:all` の `public/index.js` と `index.css` の sha256 が main と同一なことを確認した)。

| パッケージ | 旧 (lock) | 新 |
| --- | --- | --- |
| `chalk` | 4.1.2 | 6.0.1 |
| `cheerio` | 1.0.0-rc.3 | 1.2.0 |
| `dotenv` | 8.2.0 | 18.0.10 |
| `firebase-admin` | 8.10.0 | 14.5.1 |
| `fs-jetpack` | 2.2.3 | 5.1.0 |
| `klaw` | 4.0.1 | 4.1.0 |
| `pug` | 2.0.4 | 3.0.4 |
| `through2` | 4.0.2 | 5.0.12 |
| `@aws-sdk/client-polly` (新規) | - | 3.1169.0 |
| `@actions/core` (dev) | 1.9.0 | 3.0.1 |
| `command-line-args` (dev) | 5.1.1 | 6.0.2 |
| `common-tags` (dev) | 1.8.0 | 1.8.2 |
| `date-fns` (dev) | 2.15.0 | 4.4.0 |

`ncp`、`csv-writer`、`version-sort`、`npm-run-all`、`prettier`、Electron のメインプロセスが使うもの (`electron*`) は変えていない。`public/package.json` と `public/package-lock.json` も変えていない。

## ESM 専用パッケージ

`chalk` 6、`through2` 5、`cheerio` 1.2、`command-line-args` 6、`date-fns` 4 は `type: module` だが、スクリプトは CommonJS のまま、Node 26 の `require(esm)` で読む。

- `chalk`、`through2`: `require()` はモジュール名前空間を返すので `.default` を使う (`require('chalk').default`、`require('through2').default.obj`)。
- `@actions/core` 3 は `require` の export 条件が無く `require()` できないので、`tasks/utils/withActionsErrorReporting.js` で動的 `import()` する。
- `chalk` 5 以降は tagged template (`` chalk`{red ...}` ``) が無いので、`tasks/scaffold`、`tasks/sync_missions`、`tasks/audit_objectives` はメソッドチェーンに書き直した (文言と色は同じ)。

## API 変更への対応

- `firebase-admin` 14: `initializeApp`、`cert` (`firebase-admin/app`)、`getFirestore` (`firebase-admin/firestore`) を使う。`tasks/shared/firebase.js` は設定の環境変数が無いとき、変数名を含む `Error` を投げる。
- Polly: `PollyClient` と `SynthesizeSpeechCommand` を使う。`tasks/generate_voice_overs/write_files.js` はクライアントを引数で受け取り、`AudioStream.transformToByteArray()` の結果を `vo/<basename>_<id>.mp3` に書く。以前は失敗を `console.log(err.code)` するだけだったが、`AudioStream` が無い応答と Polly の失敗は `Error` になり、`index.js` がエラーを出力して終了コード 1 で終わる。認証情報は AWS の既定のプロバイダーチェーンで、リージョンは `us-east-1`。
- 変更が要らなかったもの: `date-fns` の `format` / `formatRelative` (名前付き `require`)、`cheerio.load`、`klaw`、`command-line-args` (`require()` が関数を返す)、`fs-jetpack`、`pug.renderFile`。

## 確認したこと

- `rm -rf node_modules public/node_modules && npm ci` が通る。ルートの `package-lock.json` は Node 26 の npm 11 の `npm install --package-lock-only --ignore-scripts` で再生成した。
- `npm test` が通る。`src/test/tasks/` に、依存の読み込み、`through2.obj`、`date-fns` の書式、`withActionsErrorReporting`、`tasks/shared/firebase.js` の設定エラー (一時ディレクトリで子プロセス実行)、会話ファイルの解析、偽の Polly クライアントによる音声生成を追加した。ネットワークも認証情報も使わない。
- オフラインで実行したスクリプト: `validateJsonFiles.js`、`list_objectives.js`、`audit_objectives.js` (`--only-show-changes` も)、`scaffold/index.js` (引数なしと既存名のエラー)、`generate_voice_overs/index.js` (一致するファイルが無い指定)。`audit_items.js` は `public/items` が無く、この変更の前から失敗する。
- 実行していないもの (認証情報とネットワークが要る): `sync_missions`、`generateVoiceOvers` の Polly 呼び出し、`tauri build`。構文チェック (`node --check`) と依存の読み込みだけ確認した。`generate_changelog.js` は `origin/master` と `pbcopy` が必要なので読み込みだけ。
