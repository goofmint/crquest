# Tauri 2 scaffold (#58)

`src-tauri/` を追加した。Electron は変更していない (`main.js`、`start`、`launch` は従来どおり)。#59 (plugin) / #60 (platform 切替) / #61 (command) は未着手である。

## 構成

- `src-tauri/tauri.conf.json`: ウィンドウは `main.js` の BrowserWindow と同値 (1280x800、最小 1024x576、背景 `#232323`、title `TerminalQuest`)。
- `src-tauri/Cargo.toml`, `build.rs`, `src/lib.rs`, `src/main.rs`: `tauri::Builder::default()` のみ。plugin、command、state なし。失敗時は `expect` で明示的に落とす。
- `src-tauri/capabilities/default.json`: `main` ウィンドウに `core:default` のみ。
- `src-tauri/Cargo.lock`: コミットする (アプリのため)。`target/`、`gen/` は `.gitignore`。
- ルート `package.json`: devDependency `@tauri-apps/cli`、dependency `@tauri-apps/api` (^2)、script `"tauri": "tauri"` のみ。dev/build のラッパーは置いていない。

## 判断事項

- `frontendDist` は `../public`。Vite は `public/` に出力する (`docs/migration/vite-build.md`)。`devUrl` は無く、`tauri dev` は CLI 内蔵サーバーで `public/` を配信する。
- `beforeDevCommand` / `beforeBuildCommand` は `npm run build:all` (dev 側は `wait: true`)。`npm run tauri -- dev` を実行すると `build:all` が走る (`clean` が `public/` の生成物を消す点は従来の `npm start` と同じ)。
- `version` は `../public/package.json` を参照 (ゲームのバージョンの正本、現在 3.12.1)。`cargo check` で解決できることを確認済み。`Cargo.toml` の version は 3.12.1 を手書きしており、`tauri.conf.json` 側が優先される。
- `identifier` は `com.terminalquest.desktop` (新規に決めた値。`.app` 終わりは macOS の拡張子と衝突するため避けた)。
- `csp` は `null` (`tauri init` の既定)。Electron は `nodeIntegration` 前提のため、現行フロントはそのままでは Tauri で動かない。これは #60 以降の範囲。
- 本番ビルドは `frontendDist` 全体 (`public/node_modules` を含む) を埋め込む。配布構成 (埋め込み対象の絞り込み) は後続タスク。
- アイコン: `public/images/app/logo.png` (2560x1440) を透明で正方形にパディングし、`npm run tauri -- icon <png> -o src-tauri/icons` で生成した暫定版。Android/iOS 用は削除済み。製品アイコンへの差し替えは別途。
- `@tauri-apps/api` はフロントがまだ使わないため未使用。

## 検証済み (エージェント)

- `cd src-tauri && cargo check` / `cargo clippy` が成功。
- クリーンな `npm ci`、`npm run build:all`、`npm test`。

## 手元で確認すること (利用者が実行する)

エージェントは GUI を起動していない。

```sh
# 前提: Rust (rustup)、macOS は Xcode Command Line Tools
npm ci
npm run tauri -- dev      # ビルド後にウィンドウが 1280x800 / 背景 #232323 / title TerminalQuest で開くか
```

- 空白または黒いウィンドウ (またはフロントのエラー) は想定内である。Electron 専用の `require` を使うため、フロントの Tauri 対応は #60 以降。
- ウィンドウを小さくして 1024x576 より縮まらないこと。
- `npm start` (Electron) が従来どおり動くこと。
