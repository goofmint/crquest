# 最終検証 (#68)

Electron から Tauri への移行の最終検証の記録。クリーンな環境 (`node_modules` と `public/node_modules` を削除してから `npm ci`) で、コミット c3944f2 (Electron 削除済みの main) を基に実行した。アプリは一度も起動していない。

## 環境

- macOS (Darwin, arm64)
- Node.js v26.13.1 / npm 11.20.0
- rustc 1.97.1 / cargo 1.97.1

## 「lint」の定義

新しい lint ツール (ESLint など) は導入していない。既存の静的検査を lint とする。

- JS 側: `npm run check:platform`
- Rust 側: `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`

## 検証中に直した不具合

1. `check:platform` の誤検出。`src/js/app/common/codeRunnerWorker.js` と `ValidationHelper.js` のコメント、およびワーカーの fs モックのキー文字列に一致して終了コード 1 になっていた。`tasks/check_platform_boundary.js` を直し、`git ls-files -z` で追跡済みの JS / JSX を列挙し、すべてを全文 `@babel/parser` (JSX 対応) で構文解析して、AST の `import` / `export ... from` / `require()` / 動的 `import()` が禁止指定子を読むものだけを違反にする (コメント、文字列、複数行の書き方、テンプレートの `${}` 内は構文解析が扱う)。解析できないファイルは明示的なエラーで終了コード 1 になり、スキップしない。CLI の契約 (違反は `パス:行:内容` を stdout、エラーを stderr、終了コード 1。違反なしは 0。git の失敗は例外) は維持。判定は `collectViolations(root)` として export し、直接実行時だけ main を走らせる。回帰テストは `src/test/tasks/checkPlatformBoundary.test.js`。`codeRunnerWorker.js` と `ValidationHelper.js` は編集していない。
2. debug バンドルのビルド失敗。`tauri build` が「`frontendDist` に `node_modules` フォルダがある」として拒否した (`tauri-dist/node_modules/animate.css/animate.min.css` をステージングしていたため)。`tasks/stage_tauri_frontend.js` がこの CSS を `tauri-dist/lib/animate.min.css` に置くようにし (`RUNTIME_NODE_MODULES_FILES` は `{ from, to }` の組)、`src/index.html` の href を `lib/animate.min.css` に変更した。関連するテスト (`resources.test.js`) と Rust テスト (`src-tauri/src/lib.rs`) を合わせた。`cargo fmt` を適用した。

## 結果 (修正後の最終実行)

| 手順 | コマンド | 結果 |
| --- | --- | --- |
| クリーンインストール | `rm -rf node_modules public/node_modules && npm ci` | 終了コード 0 |
| テスト | `npm test` | 終了コード 0。79 ファイル / 1635 テスト合格 |
| JS の境界チェック | `npm run check:platform` | 終了コード 0 (違反なし) |
| Rust 整形 | `cargo fmt --check` | 終了コード 0 |
| フロントエンドのビルド | `npm run build:tauri` | 終了コード 0 |
| Rust lint | `cargo clippy --all-targets -- -D warnings` | 終了コード 0 |
| Rust テスト | `cargo test` | 終了コード 0。55 件合格 (他の 2 ターゲットは 0 件) |
| debug バンドル (app) | `npm run tauri -- build --debug --bundles app` | 終了コード 0。`TerminalQuest.app` (110.46 MiB) を作成。起動していない |
| debug バンドル (全形式) | `npm run tauri -- build --debug` | 終了コード 1。Rust のコンパイルと `.app` のバンドルは成功し、`.dmg` の作成だけが失敗 |

`.dmg` の失敗の内容は、`bundle_dmg.sh` が Finder に送る AppleScript が「AppleEvent がタイムアウトしました (-1712)」で失敗したこと。Finder の自動操作 (権限またはデスクトップセッション) に依存するヘルパーで、環境の問題でありコードの不具合ではないため、環境は修正していない。`--bundles app` で代替した。

`npm test` と `npm run build:tauri` は修正 1 と 2 の前後で実行した。上の表は修正後の値である。`cargo fmt --check` は、修正 2 で `lib.rs` を編集した直後に一度失敗し、`cargo fmt` で直した (最終結果は合格)。

## 検証していないこと

- アプリの起動と実機での動作 (起動は禁止されていた)。
- `.dmg` の作成 (上記)。
- Windows / Linux でのビルドとバンドル、署名、notarize、release バンドル。
- `npm ci` の postinstall は npm 6 前提の `public/` 側ロックを手で変更しておらず、ルートの lock との整合は `npm ci` の成功で確認した。

## ユーザーが行う手動確認 (#63)

1. `npm start` (`tauri dev`) でアプリを起動し、タイトル画面と新規ゲーム開始、アバター作成を確認する。
2. ミッションを 1 つ開始し、コードの実行 (Code Runner)、ターミナルのコマンド、検証 (ValidationHelper) が動くことを確認する。
3. 起動時に `animate.css` のアニメーション (トースト等) が出ること (今回 `lib/animate.min.css` へ移したため必ず見る)。
4. セーブとロード、設定の保存、再起動後の状態保持を確認する。
5. `content/` と `levels/` (asset プロトコルで読む) の画像と音声が出ること。
6. 配布するすべての OS で `npm run release` (または `tauri build`) が通り、生成物が起動すること。macOS では `.dmg` の作成 (Finder の自動操作を許可した環境) も確認する。
