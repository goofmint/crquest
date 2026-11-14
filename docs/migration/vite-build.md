# Vite ビルド (Phase 7: 7-1, 7-3, 7-4, 7-5)

レンダラー (`src/js`) のビルドを Babel (ファイル単位の CommonJS 出力) から Vite に置き換えた。設定は `vite.config.mjs`。Electron 11 (Chromium 87, `nodeIntegration: true`) のまま動かすための構成で、Tauri 移行後の姿ではない。

## 測定した事実 (Electron 11.5.0 の BrowserWindow, nodeIntegration: true)

- 通常の `<script>` でも `<script type="module">` (インライン・外部ファイルとも) でも、`require` / `module` / `__dirname` がグローバルに見える (`exports` は見えない)。
- `require` はページ (`public/index.html`) のディレクトリを基準に解決する。`require.resolve.paths` の先頭は `public/node_modules`。
- `__dirname` はページのディレクトリ (`public/`) で、バンドル内のファイル位置とは無関係。
- `document.baseURI` は `file:///.../public/index.html`。
- 生成した `public/index.js` は Electron 11.5.0 (V8 8.7) の `vm.Script` で構文エラーなく読み込める。

## 設計

(a) バンドル方式: `src/js/index.jsx` を 1 ファイルの `public/index.js` にバンドルする (`vite build`, Rolldown)。
- 形式は CommonJS 出力を、banner/footer で `(function () { 'use strict'; ... })();` に包んだもの。従来どおり古典的な `<script src="index.js">` で読み込む。包むのは、トップレベルの `let` が ace / phaser などの他スクリプトのグローバルと衝突しないようにするためと、ES モジュールが暗黙に持っていた strict mode を保つため。
- `build.target` は `chrome87`。この指定では class fields が `@oxc-project/runtime` のヘルパー (`defineProperty`) に変換される (Babel の class-properties と同じ意味)。ヘルパーはバンドルに取り込むため、`@oxc-project/runtime` を devDependency に入れている。
- Node 組み込み、`electron`、`public/node_modules` のパッケージ (react, jimp, pug など、裸のモジュール指定すべて) は external。`require("...")` のまま残り、実行時にレンダラーの `require` が `public/node_modules` から解決する (従来と同じ解決元)。バンドルするのは `src/` 以下のアプリのコードだけ。
- JSX: `@vitejs/plugin-react` を `jsxRuntime: 'automatic'` で使う (React 19 化 (#46) 以降。それ以前は React 16.8 に `react/jsx-runtime` が無く classic だった)。`react/jsx-runtime` も他の裸の import と同じく実行時に `public/node_modules` から解決する。`vite.config.mjs` は `NODE_ENV=production` に固定する (呼び出し側の `NODE_ENV=development` で `react/jsx-dev-runtime` が出力されるのを防ぐ。React の production ビルドには `jsxDEV` が無い)。Vite 8 の oxc は `.js` の JSX を解釈しないため、JSX を含んでいた 13 ファイルを `.jsx` にリネームした (import は拡張子なしなので変更なし)。
- `public/` は静的ルートのまま。`images/`, `lib/`, `levels/`, `content/`, `code_runner/`, `avatars/` などはバンドルせず、`publicDir: false` と `emptyOutDir: false` で Vite に触らせない。

(b) `__dirname`: `staticFilePath` は `fileURLToPath(new URL('.', document.baseURI))` (= ページのディレクトリ `public/`) を基準にする。呼び出し側の仕様 (相対パス → 絶対パス、絶対パスはそのまま) は同じ。`file:` 以外のページでは例外になる (フォールバックなし)。ほかに `__dirname` / `__filename` を使うアプリコードは無い (`moduleLoader` の文字列は拡張用ラッパーの引数名)。

(c) 実行時 `require(変数)` (`assetLoader.requireFromExtension`): 変数を渡す `require` は静的に解決できないため、出力にそのまま残り、グローバルの `require` (nodeIntegration) が評価する。`require.cache` / `require.resolve` も同様。#21 のローダーへ置き換えるまでこのまま。

(d) `local_config` と JSON: `config.js` の `require('./local_config')` は `vite.config.mjs` の小さなプラグインが処理する。`src/js/app/config/local_config.js` があればバンドルし、無ければ実行時に `Cannot find module './local_config'` を投げる (従来どおり `config.js` が catch してログに出す)。JSON import (`bundledExtensionModules.json` など) は Vite が標準で扱う。`babel-plugin-inline-json-import` は廃止した。

(e) `src/templates/index.pug` を `src/index.html` に置き換えた (内容は同じ link / script タグとローディング表示。`<meta charset>` を追加)。Vite の HTML エントリにはせず (古典 script と `lib/` の link を Vite に処理させないため)、プラグインがそのまま `public/index.html` に出力する。

(f) 開発の流れ: `npm start` は `build:all` を 1 回実行 → `electron .` と `watch:all` を並列実行、が従来どおり。`watch:js` は `vite build --watch --sourcemap` (index.html の変更も監視)。開発サーバーは使わない (`main.js` は `loadFile` のまま)。`build:all` は 1 回限りのビルドで、テストや CI から使える。

(g) 生成物と `.gitignore`: `public/index.html`, `public/index.js(.map)` (Vite)、`public/index.css(.map)` (sass) が生成物で、追跡しない。`public/app/` と `public/test/` は旧 Babel ビルドの出力で、新しいビルドは作らないが、古い作業ツリーに残るため ignore を残している。`emptyOutDir: false` なので、`npm run clean` (`tasks/clean_build_output.js`、`build:all` の先頭でも実行) がこれらだけを削除する (静的アセットには触れない)。`.gitignore` との一致はテスト (`src/test/tasks/cleanBuildOutput.test.js`) で確認している。

## Babel の残り

Jest (`babel-jest`) のためだけに `.babelrc` を残している (preset-env, react, class-properties, transform-runtime の `regenerator` のみ)。アプリのビルドは Babel を使わない。テストは Phase 9 で置き換えるため、それまで維持する。廃止したもの: `@babel/cli`, `babel-plugin-inline-json-import`, `@babel/runtime-corejs2` (`transform-runtime` の `corejs: 2`)、`pug-cli`。`@babel/runtime-corejs2` は `public/package.json` と `public/package-lock.json` からも外した。

## npm scripts

| script | コマンド |
| --- | --- |
| `build` | `npm run build:all` |
| `build:all` | `npm-run-all clean --parallel build:js build:css` |
| `build:js` | `vite build` |
| `build:css` | `sass src/scss/main.scss public/index.css --no-source-map` |
| `clean` | `node tasks/clean_build_output.js` |
| `watch:all` | `npm-run-all --parallel watch:js watch:css` |
| `watch:js` | `vite build --watch --sourcemap` |
| `start` | `npm-run-all build:all -r --parallel launch watch:all` (変更なし) |

`build:html` / `watch:html` は廃止 (HTML は `build:js` が出力する)。
