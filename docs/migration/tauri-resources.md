# Tauri リソース同梱 (#62)

ゲームが実行時にディスクから読むコンテンツを、Tauri の `bundle.resources` で配布物に入れる。Electron の挙動は変えていない。

## 1. 同梱の対応表 (`src-tauri/tauri.conf.json`)

| 元 (`src-tauri/` から) | 配置先 (`$RESOURCE/` 配下) | 読み手 |
| --- | --- | --- |
| `../public/content/` | `content/` | `common/extensions.js` (`vendoredExtensionModules.json` の 7 パッケージ全て、`BUNDLED_EXTENSION_VENDORED_DIRECTORY = 'content'`)、`assetLoader.js` |
| `../public/levels/` | `levels/` | `levelLoader.js`、`world.js` (レベル)、`Game.jsx` (`levels/common/entities`)、`audio/index.js` (`levels/common/music`、`sfx`)、`InteractionTextService.js` |
| `../public/avatars/parts/` | `avatars/parts/` | `avatarRenderer.js` (Jimp がディスクから読む) |

配置先は `public/` からの相対パスと同一である (Electron の `staticFilePath(相対パス)` が指す先と同じ相対パス)。テストがこの対応を固定する。マップ形式を使う理由は、リスト形式だと `../public/...` が `$RESOURCE/_up_/public/...` になるため。

同梱しないもの:

- `public/node_modules`: 7 パッケージすべてが vendored (`public/content`) になっており、実行時の `getBundledExtensionDirectories()` は `node_modules` を引かない。コンテンツが `require` する `lodash.merge` / `lodash.isequal` は新ローダーの許可リストが提供する (`module-loader-usage.md`)。
- `images/`、`fonts/`、`lib/`、`movies/`、`code_runner/`、`avatars/`、`index.*`: ページが URL で読む。`frontendDist` (`../tauri-dist`、`public/` から `content/` と `levels/` などを除いたもの) としてバイナリに埋め込まれる。
- `public/package.json`: アプリのバージョンは `tauri.conf.json` の `version` が参照するため、実行時に読まない (`platform/tauri/paths.js`)。

## 2. パス解決

- `platform/paths.js` に `getResourceDirPath()` を追加した (Electron / Tauri で同名、同期、未初期化は throw)。
  - Electron: `staticFilePath('.')`、つまり読み込むページのディレクトリ (`public/`)。`getBundledExtensionRoot` が使う `staticFilePath('content')` と同じ基準。
  - Tauri: `initPlatform()` が `resourceDir()` を読み、以降は同期で返す。`$RESOURCE` と同じ場所で、capability の fs 読み取り scope (`$RESOURCE/**`) と一致する。
- 呼び出し側 (`staticFilePath` 等の Tauri 版への切り替え) は本チケットの範囲外 (#60 以降)。呼び出し側は `getResourceDirPath()` に `content/<パッケージ>` などを連結すればよい。

## 3. 自動検証

`src/test/app/platform/tauri/resources.test.js` が `tauri.conf.json` を読み、各エントリの元ディレクトリの存在、配置先が `public/` 相対と一致すること、配置先が重ならないこと、`content/`・`levels/common/*`・`avatars/parts` が含まれ、`node_modules` などが含まれないことを検証する。ディレクトリを移動・改名すると失敗する。

`cargo check` (`build.rs`) はリソースを `src-tauri/target/debug/{content,levels,avatars/parts}` にコピーする。ファイル数 (2242 / 116 / 15) が元と一致することを確認済み。

## 4. 利用者が確認すること (エージェントはバンドルを作っていない)

```sh
npm ci
npm run tauri -- build --debug
```

- macOS: `src-tauri/target/debug/bundle/macos/TerminalQuest.app/Contents/Resources/` に `content/`、`levels/`、`avatars/parts/` がある。`content/` に 7 パッケージ (`twilioquest-base/package.json` 等)、`levels/common/music`・`sfx`・`entities`、`avatars/parts/body.png` がある。`_up_/` が無い。
- Windows: インストール先 (または `bundle/msi` 展開先) の `TerminalQuest.exe` と同じ階層に同じ構成がある。Linux: deb は `/usr/lib/TerminalQuest/` 配下 (配置は Tauri の deb 規約に従う。実機で確認する)。
- `tauri dev` では `$RESOURCE` は `src-tauri/target/debug/` で、`build.rs` がコピーしたものが使われる。ただしコピーはビルド時なので、`public/content` を編集したら Rust 側の再ビルドが必要。
- 起動後 (フロント対応後) に `getResourceDirPath()` の値が上記のディレクトリを指すこと。

## 5. 既知の注意

- (W12 で解消) `frontendDist` は `tauri-dist/` (`tasks/stage_tauri_frontend.js` が `public/` から `content/`、`levels/`、`node_modules` (`animate.min.css` を除く)、`package*.json`、ドット始まりのファイルを除いて作る) になり、`content/` と `levels/` はリソースにだけ入る。ページはこれらを asset プロトコル (`$RESOURCE/**` の scope) で読む。詳細は `tauri-runtime.md` の W12。
- `bundle.resources` のディレクトリはそのままコピーされるため、`public/content` / `public/levels` 配下の `.DS_Store` 等の未追跡ファイルは入りうる。CI など clean な checkout でビルドする。
