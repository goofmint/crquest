# Tauri ランタイム監査と作業分割 (#131)

Tauri 2 の webview (`require` なし、`remote` なし、同期 fs / dialog なし) でゲームが起動し動作するのを妨げているものの棚卸しと、PR 単位の作業分割である。アプリケーションコードは変更していない (本書のみ)。Electron の実行時挙動は変えない方針で分割している。

- 調査対象コミット: `5ac3881` (main、`issue-131-tauri-runtime-audit` の起点)
- 行番号はすべてこのコミットの `grep` で確認した値である。
- 実機・アプリは起動していない。この作業ツリーには `node_modules` が無いため、`vite build --mode tauri` の出力も今回は生成していない。出力についての記述は `vite.config.mjs` と既存テスト (`src/test/app/platform/tauri/selection.test.js:73-84`) の内容に基づく。確認が必要な点は「要確認」と書いた。
- 前提となる既存の記録: `tauri-shell.md`、`tauri-platform.md`、`tauri-resources.md`、`tauri-scaffold.md`、`sync-api.md`、`vite-build.md`、`module-loader-usage.md`、`code-runner-worker.md`、`validation-helper-worker.md`、`docs/baseline/platform-boundary.md`。

## 1. 現状の整理

Tauri ビルド (`npm run build:js:tauri` = `vite build --mode tauri`) は、`src/js/tauriIndex.jsx` (入口) が `await initPlatform()` のあと `import('./index.jsx')` でゲーム本体を読む構成になっている (`tauriIndex.jsx:11-16`)。`platform/<名前>` の import は `platform/tauri/<名前>` に差し替わり、`@tauri-apps/*` だけがバンドルされる (`vite.config.mjs:41-52, 61-80`)。それ以外の裸の import (react、jimp、pug など) と Node 組み込みは external のままで、出力に `require("...")` として残る (これは調査時点の状態。W1 と W2 で解消した: 4 章の各「実施結果」を参照)。

`#64` (tauri-shell) 以降、`platform/tauri/*` (fs、store、dialog、exec、paths、env、shell、devtools) と Rust 側 (`src-tauri/src/lib.rs`: `run_command`、`command_exists`、`is_dev`、devtools、終了確認) は揃っている。残っているのは、レンダラー側のアプリコードと Tauri ビルドの構成である。

## 2. ブロッカー一覧

重大度は「起動を止める」(S1: 最初の起動マイルストーンまでに必須) と「その機能を使うと止まる」(S2: 後続) に分ける。

### B1. ビルド出力が webview で読み込めない (S1)

| 場所 | 内容 |
| --- | --- |
| `vite.config.mjs:150-176` | 出力形式は `cjs`。動的 import のチャンクは `tauri-game.js` で、入口 `index.js` は `require("./tauri-game.js")` で読む (既存テストがこれを固定している: `selection.test.js:80`)。webview に `require` は無いので、入口が最初にゲームを読む時点で `require is not defined` になる。これが #131 本文の症状である。 |
| `selection.test.js:82` | `tauri-game.js` の先頭付近に `require("react")` が残ることを期待している (外部の裸の import は `require` のまま)。 |
| `vite.config.mjs:41-52` | `isExternal` は `@tauri-apps/*` 以外の裸の指定子をすべて external にする。Tauri ではすべてバンドルが必要。 |
| 解決元 | 裸の import のパッケージは `public/package.json` に宣言されている (react、jimp、pug、dexie、howler など)。ルート `package.json` にも一部の同名パッケージがあり、バージョンが異なるものがある (例: `pug` はルートが `^2.0.4`、`public/package.json:32` が `^3.0.2`)。Electron は実行時に `public/node_modules` の版を `require` する。バンドルでは Vite の解決元がルートの `node_modules` になるため、何も指定しないと、ルートにあるパッケージはルートの版 (`pug` 2 など) が選ばれ、無いものは解決できない。したがって `public/node_modules` を **先に** 探索させ、Electron と同じ版を取り込む必要がある。 |

必要なこと: Tauri のときだけ、(a) `require` を使わない出力形式にする。ただし、ゲーム本体の評価が `await initPlatform()` の後になる境界 (`tauriIndex.jsx:11-16`) は維持する (`config.js` が読み込み時に `paths` を読むため。`tauri/state.js` は初期化前に throw する)。`inlineDynamicImports` / 単一ファイル化は、動的 import 先が入口の評価時に先に実行される恐れがあるので、境界を保てると確認できるまで採用しない (ES モジュール + コード分割 + `<script type="module">` などを比較する)、(b) 裸の import をバンドルする、(c) `public/node_modules` を解決対象に加える。`clean_build_output.js` の `GENERATED_PATHS` (`tauri-game.js`) は不要になれば更新する。

### B2. Node 組み込みモジュール (S1)

Tauri の webview に Node 組み込みは無い。`src/js` (platform 以外) が import するもの。

| モジュール | 場所 | 用途 |
| --- | --- | --- |
| `path` | 18 ファイル: `config/config.js:1`、`QuestIDE.jsx:1`、`nav_map/assets.js:1`、`nav_map/hooks/useTiledMap.js:1`、`HackInterface.jsx:14`、`ValidationHelper.js:1`、`Game.jsx:3`、`Validator.jsx:1`、`loadItemsFromDisk.js:1`、`levelLifecycleManager.js:1`、`moduleAllowlist.js:19`、`elevator_interface/assets.js:1`、`assetLoader.js:1`、`levelLoader.js:1`、`extensions.js:1`、`fs_utils.js:1`、`audio/index.js:2`、`tiled.js:1` | `join` 約 46 回、`resolve` 3 回、`basename` 5 回、`extname` 4 回、`dirname` 1 回、`sep` 4 回 (`assetLoader.js` の `getBundledExtensionRoot` / `getOwningExtensionName` など) |
| `events` | 7 ファイル: `DynamicLevel.js:1`、`TransitionArea.js:1`、`Player.js:1`、`MapObject.js:1`、`InteractableObject.js:1`、`common/context/index.js:2`、`codeRunnerWorker.js:1` | `EventEmitter` |
| `util` / `assert` | `moduleAllowlist.js:20-21` | 拡張コンテンツが `require('util')` / `require('assert')` するための許可リスト実装 (`moduleAllowlist.js` 冒頭のコメントに「Tauri の前に置き換える」と明記済み) |
| `url` | `fs_utils.js:2` (`fileURLToPath`) | `staticRootPath` (B3) |
| `process` | `context_provider/system.js:2` (`import { platform } from 'process'`、未使用の import)、`system.js:57` (`process.platform`)、`ValidationHelper.js:59` (`process.platform`) | OS 判定 |
| `child_process` / `fs` / `fs-jetpack` / `electron*` | `platform/*.js` (Electron 実装) のみ | Tauri ビルドでは `platform/tauri/*` に差し替わるため対象外 |

`path` は Windows の区切り文字 (`path.sep`) の挙動に依存している (`assetLoader.js:255,287`、`extensions.js`)。macOS を最初の対象とし、Windows のパス意味論は別項目 (W13) にする。

### B3. 静的ファイルのパスと URL (S1 / S2)

Electron はページが `file:` URL なので、`document.baseURI` から絶対パスを作り、`file-url` で `file:` URL に戻して画像や音声に渡している。Tauri では `document.baseURI` は `tauri://localhost/` (macOS・Linux) または `http://tauri.localhost/` (Windows) で、`file:` ではない。

| 場所 | 内容 | 影響 |
| --- | --- | --- |
| `fs_utils.js:15-17` (`staticRootPath`) | `fileURLToPath(new URL('.', document.baseURI))` が `file:` 以外で例外 | `staticFilePath` を使う全て (下) が落ちる (S1) |
| `fs_utils.js:20-28` | `staticFilePath` / `staticFileUrl` | 呼び出し: `paths.js:72,83` (Electron 実装のみ)、`HackInterface.jsx:4`、`Game.jsx:10,224,237`、`InteractionTextService.js:2,16`、`code_runner.js:1,11`、`avatarRenderer.js:2,44-65`、`world.js:4,46`、`levelLoader.js:3,35`、`assetLoader.js:13,254`、`extensions.js:3,124`、`audio/index.js:5,161,171,192,202`、`AvatarSelector.jsx:6,60`、`ValidationHelper.js:9,265,348` |
| `file-url` | `fs_utils.js:3,27`、`Conversation.jsx:4,271`、`SpriteSheet.jsx:2,16`、`useAssetLoader.jsx:2,22,31,52` | 絶対パスから `file:` URL を作る。webview (`tauri://` オリジン) は `file:` を読めない |
| 絶対パスを URL としてそのまま Phaser / Howler に渡している箇所 | `EntityConfigService.js:271,273` (`load.image` / `load.spritesheet` に `${objectDirPath}/${fileName}`)、`Game.jsx:166-212` (`resolveAbsolutePath` の戻り値を `fileUrl` として保持)、`DynamicLevel.js:66-81`、`audio/index.js:236`、`audio/index.js:171,202` (`staticFileUrl` に絶対パスを渡す) | Electron では `file:` ページ相対で偶然動く。Tauri では `tauri://localhost/Users/...` になり 404 |
| Worker の URL | `code_runner.js:11`、`ValidationHelper.js:265,348` (`staticFileUrl('code_runner/worker.js')`) | Tauri では埋め込み済みの同一オリジン相対 URL (`code_runner/worker.js`) にする必要がある。`asset:` や `file:` のスクリプトは Worker に使えない (S2) |

読み出し元 (ディスク上の拡張機能コンテンツ) と画面に出す URL は別物として扱う必要がある。

- ディスク読み取り: `$RESOURCE` (= `getResourceDirPath()`、`tauri-resources.md`) 配下の `content/`、`levels/`、`avatars/parts/` を `platform/fs` で読む。ユーザーの拡張機能ディレクトリも `platform/fs` で読む。
- URL: `public/` に埋め込まれているもの (`levels/`、`content/` の画像・音声、`images/`、`code_runner/`) は相対 URL で読める。ユーザーの拡張機能ディレクトリのファイルは埋め込まれていないので、asset プロトコル (`convertFileSrc`) が必要になる。asset プロトコルは現在無効 (`src-tauri/Cargo.toml:19` の `features = []`、`tauri.conf.json` に `assetProtocol` なし)。
- 同じ `resolveAbsolutePath` の戻り値が上記両方の場所を指すので、「絶対パス -> URL」を 1 箇所の関数 (platform の新モジュール) に集約するのが最小の変更になる。Electron 実装は現在の `file-url` 呼び出しそのままにする。

### B4. 起動時に呼ばれる同期 API (S1)

`tauri-platform.md` 3.2 章の一覧のうち、レンダラーの実行時コードに残る呼び出し元 (Tauri では `ERR_TAURI_SYNC_UNSUPPORTED` を投げる)。

| 呼び出し | 場所 | 起動への影響 |
| --- | --- | --- |
| `getValue(key)` | `context_provider/ContextProvider.jsx:102` (`pipeAsync` の同期ステップ。外側は既に `async`) | コンテキスト初期化で落ちる (S1) |
| `getValue('audio')` | `audio/index.js:111` (`loadState`、`checkLoaded` から呼ばれる: `audio/index.js:80-87`) | 音声の読み込み完了時に落ち、`index.jsx:192` の `audioManager.onload` が呼ばれず App が描画されない (S1) |
| `setValue('audio', ...)` | `audio/index.js:131` (`saveState`。`useAudioManager` の `syncAudioState` から) | 音量変更時 (S2) |
| `setValue(key, value)` | `common/context/index.js:77` (`setContext` の `setState` コールバック内) | コンテキストが変わるたびに落ちる (S1。初期化直後の `setContext(initialState)` から) |
| `hasValue` / `deleteValue` | `ClearDataButton.jsx:14,16` | データ消去 (S2) |
| `remove(path)` | `ClearDataButton.jsx:56` | データ消去 (S2)。W4 で `removeAsync` に置換済み |
| `list(path)` | `Game.jsx:228` (`for (const entityKey of list(commonEntitiesDir))`、周囲は既に `async`) | レベル読み込み = fog_owl 到達 (S2、マイルストーン 2)。#150 で `listAsync` に置換済み |
| `readFileSync('/proc/cpuinfo')` | `context_provider/system.js:25` (try/catch 内) | W6 (#137) で非同期の `readFile` に置換済み。Tauri の fs scope に `/proc/cpuinfo` を追加した |
| `pathExistsSync` | `ValidationHelper.js:173` (`isExecutableValid` は既に `async`: `ValidationHelper.js:156`) | W6 (#137) で非同期の `pathExists` に置換済み |

store の同期 API の扱いは判断事項 D1 を参照。Electron の `platform/store.js` には `*Async` が無い (`store.js:48-75`)。Tauri の `platform/tauri/store.js` にだけ `getValueAsync` 等がある。

### B5. `electron` / `remote` / `Menu` (S1)

| 場所 | 内容 |
| --- | --- |
| `src/js/index.jsx:8` | `const { remote } = require('electron');` (ゲーム本体の評価中に実行され、`require is not defined` になる。B1 とは別の独立した原因) |
| `index.jsx:88-162` | `remote.Menu.getApplicationMenu()` の Help サブメニューに 4 項目 (開発者ツール、"Sync Bundled Assets"、"Open User Data"、"Open Save File") と、dev のみ 2 項目 (Spector.js) を追加 |
| `index.jsx:162` | `Menu.setApplicationMenu(applicationMenu)` |

Tauri 側の現状: DevTools は Rust コマンドとキーボードショートカット (`tauriShell.js:57-83`)、外部リンクは `tauriShell.js:36-55`、終了確認は `close.rs` で実装済み。未対応のメニュー項目は "Sync Bundled Assets" (`assetLoader.syncBundledAssets`)、"Open User Data" (`config.userDataPath`)、"Open Save File" (`config.saveFilePath`)。Spector.js 関連 2 項目は dev 専用で、CDN からスクリプトを読む (`index.jsx:72-86`) ため、Tauri でも `isDev()` のとき同じ読み込みが走る (起動は止まらない)。

注意: Tauri の store の保存先は `$APPDATA/com.terminalquest.desktop/config.json` で、Electron の `config.saveFilePath` (`userData/config.json`) と一致しない (`tauri-platform.md` 1.4 章)。メニューの "Open Save File" を Tauri に移すときは、どのファイルを開くのか (または項目を落とすのか) を決める必要がある (D2)。

### B6. 起動シーケンスの競合 (S1)

`index.jsx:186-190` は `DOMContentLoaded` を待ってから描画する。Electron では `<script src="index.js">` がページ末尾の古典 script として同期的に評価されるので、このイベントより前にリスナーが登録される。Tauri では入口が `await initPlatform()` (IPC 往復) のあとに `import('./index.jsx')` するため、ゲーム本体の評価時にはすでに `DOMContentLoaded` が発火済みの可能性が高く、リスナーが永久に呼ばれず描画されない。`document.readyState` を見て、読み込み済みなら即座に進める必要がある (Electron では常に `loading` の間に評価されるので挙動は変わらない)。

### B7. Electron 版でしか動かないライブラリの使い方 (S1 は bundle 成否、S2 は実行)

| パッケージ | 使用箇所 | 問題 |
| --- | --- | --- |
| `pug` | `Conversation.jsx:2,224` (`pug.renderFile(absolutePath, context)`) | `renderFile` は Node の fs で読む。`pug` の package.json は browser で `fs: false`。NPC との会話で止まる (S2)。拡張コンテンツの `.pug` は 110 ファイル、うち `include` / `extends` を使うのは 1 ファイル (`public/content`、`public/levels`) |
| `cheerio` | `Conversation.jsx:3,228` | bundle 後にブラウザで動くか要確認 (`cheerio.load`) |
| `jimp` | `avatarRenderer.js:1,44-65,100` (`Jimp.read(絶対パス)`) | ブラウザ版 (`browser` フィールド) は URL 読み込みで、ファイルパスは読めない。B3 の URL 化と合わせて対応 (S2: アバター作成) |
| `ejs` | `ObjectiveDescription.jsx:3,58` (`ejs.render(..., { async: true })`) | ブラウザで動く想定 (要確認) |
| `dexie` / `howler` / `styled-components` / `showdown` / `yup` / `react-*` / `esprima` / `uuid` | 多数 | ブラウザ向けのパッケージ。B1 の解決・バンドルで足りる想定 |

### B8. 拡張機能ローダー (S2)

`assetLoader.js` (`resolveAbsolutePath` / `readFile` / `readDirectory` / `requireFromExtension`)、`extensions.js`、`moduleLoader.js` は fs を `platform/fs` 経由 (非同期) で使い、コード実行は `new Function` (`moduleLoader.js:807-`)、`require` は自前のローダーである。`window.require` / `require.cache` は使っていない (`Validator.jsx:37` の `const _require = window.require;` は定義のみで未使用。Tauri では `undefined` になるだけで例外にはならない)。

- Tauri 実装 `platform/tauri/fs.js` は、`existsAsync` が `'dir' | 'file' | 'other' | false` を返し、`extensions.js:69` の `=== 'dir'` 判定と互換である。`readFile` は `Uint8Array` を返す (`utf8` 指定なら文字列)。
- 読み取り先は `$RESOURCE` (`tauri-resources.md`)。`tauri dev` では `src-tauri/target/debug/` で、`build.rs` のコピーが使われる。この読み取りは B3 のパス解決が前提。
- `moduleAllowlist.js` の `path` / `assert` / `util` は B2 の置き換えが必要 (拡張コンテンツが実際に `require('path')` している: `module-loader-usage.md` 4 章)。
- ユーザーの拡張機能ディレクトリ: ダイアログで選んだ場所の fs scope は再起動で失われる (`tauri-platform.md` 1.4 章)。asset プロトコルの scope も同様の検討が要る。

### B9. `main.js` の責務と Tauri での対応

| `main.js` の機能 | Tauri での状況 |
| --- | --- |
| ウィンドウ設定 (1280x800、最小 1024x576、背景色、タイトル) | `tauri.conf.json` に移行済み (#58) |
| `loadFile('public/index.html')` | `frontendDist: ../public` (#58) |
| `nodeIntegration` / `enableRemoteModule` | Tauri に対応物なし。`platform/*` (Rust command と plugin) に置き換え済み。残りは B1〜B7 |
| `process.exit(0)` (`closed`) | `close.rs` の `CloseConfirmation` + `window.destroy()` (#64) |
| `electron-context-menu` (右クリックの基本メニュー) | 対応なし。WebView 既定の挙動に任せるか明示的に無効化するかの判断が必要 (D3) |
| `electron-devtools-installer` (dev で React DevTools) | 対応不要 (dev 専用。落とす判断を明記するだけ) |
| カスタムプロトコル、IPC (`ipcMain`)、設定の保存 (main 側) | `main.js` には無い (63 行、上記のみ) |

### B10. `public/index.html` (`src/index.html`)

古典 script: `lib/firebase/firebase-app.js`、`lib/firebase/firebase-firestore.js`、`lib/ace/ace.js`、`lib/phaser-2.13.2.min.js`、`index.js`。これらは `public/` に静的ファイルとして存在し、`frontendDist` に埋め込まれるため、Tauri でも相対 URL のまま読める。`node_modules/animate.css/animate.min.css` は `public/node_modules` (`npm ci` の postinstall で作られる) から読む。`public/index.html` の変更は不要の見込み。グローバル (`Phaser`、`ace`、`firebase`) に依存するコードは `src/js` のここに無い (`window.ace` は `QuestIDE.jsx:13`、Phaser は `Game.jsx` ほか)。

### B11. 音声

`howler` (`audio/Track.js:1`) は URL を取る。入力 URL は B3 で作る。macOS の WKWebView は、ユーザー操作なしの自動再生をブロックする場合がある (タイトル画面の `music.play('overture_b'`: `TitleScreen.jsx:49`)。起動マイルストーンでは「音が鳴らない」ことがあっても画面が出るかを分けて確認する (リスク R3)。

### B12. Dexie (IndexedDB)

`common/database.js` は `new Dexie('TwilioQuest')` を開くだけで、WKWebView / WebView2 でそのまま使える。`ClearDataButton.jsx:59` の `db.delete()` と `window.location.reload()` も同様。Tauri のオリジンは Electron の `file:` と異なるため、既存の IndexedDB は引き継がれない (移行は #63 の範囲)。

## 3. 判断事項 (実装前にユーザーが決める)

| ID | 内容 | 推奨 |
| --- | --- | --- |
| D1 | store の同期 API。(A) `initPlatform()` が store 全体を先読みしてメモリに持ち、同期 `getValue` はそこから返し、`setValue` は書き込みを非同期に流す。(B) 呼び出し元 (`ContextProvider`、`audio`、`context/index.js`、`ClearDataButton`) を非同期化し、Electron の store に `*Async` を足す | (B)。(A) は `setValue` の失敗を呼び出し元に返せず、フォールバック禁止のルールに反する (握りつぶすか、別経路で通知することになる)。(B) は呼び出し元 4 ファイルの変更が Electron にも及ぶので、W4 で挙動を固定するテストを先に足す |
| D2 | メニュー項目 (B5)。(a) Rust または JS の menu API で Help メニューを組み立てる、(b) 項目を落とす (明示的に記録する)。"Open Save File" は Tauri の store ファイルと意味がずれる | 最初の起動マイルストーンまでは何も追加しない (ただしコード上は no-op を明示する)。後続 W10 で (a) を実装し、"Open Save File" は Tauri の store の場所を指すよう直す |
| D3 | 右クリックメニュー (B9) | 後続。既定のままにして記録する |
| D4 | `path` の実装。(a) `path-browserify` (POSIX のみ)、(b) 区切りを正規化する自前の薄いラッパー (`modulePath.js` に近い) | 起動マイルストーンは (a) で macOS のみ。Windows 対応は W13 で (b) を検討 |
| D5 | URL 化の方針 (B3)。ディスク上の絶対パスを (1) すべて asset プロトコルにする、(2) `public/` 配下 (= `$RESOURCE/content` など、埋め込み済み) は相対 URL、それ以外 (ユーザー拡張) は asset プロトコル | (2)。asset プロトコルの有効化 (Cargo feature `protocol-asset`、`assetProtocol` scope、capability) は範囲を最小にする |

## 4. 作業項目 (PR 単位)

規模は変更ファイル数の見積もり (テスト・ドキュメントを含む)。すべて 300 ファイルを大きく下回る。「Electron リスク」は、Electron の実行時挙動が変わりうるかである。Tauri ビルドのみに作用する項目は、`vite build` (Electron) の出力 (`public/index.js`) が変更前と同一であることを SHA-256 で確認する (`tauri-platform.md` 3.1 章と同じ方法)。

### W1. Tauri ビルドの出力形式と依存解決 (B1)

- 内容: `--mode tauri` のとき、裸の import をバンドルし、`public/node_modules` を **優先して** 解決する (ルートの `pug` 2 などが入らず、`public/package.json` の版が入る)。`require` を使わない出力形式にしつつ、`await initPlatform()` のあとに `import('./index.jsx')` が評価される境界を維持する (単一ファイル化と `inlineDynamicImports` は、この境界を保てると確認できるまで使わない)。`selection.test.js:80,82` の期待 (`./tauri-game.js` の `require`、`require("react")`) は出力形式に合わせて更新し、境界 (初期化前にゲーム本体が評価されないこと) と、`pug` などの解決先 (ビルド出力の検査) をテストで確認する。
- 規模: 約 4 ファイル (`vite.config.mjs`、`selection.test.js`、`tasks/clean_build_output.js` とそのテスト、`.gitignore` に変更があれば)。
- 依存: なし (最初に着手)。
- Electron リスク: なし (`platformTarget === 'tauri'` のときだけ)。`public/index.js` の SHA-256 が変更前と同一であること。
- 備考: ビルドを通すには W2 も必要 (Node 組み込みが解決できない)。W1 単独の PR では「Node 組み込みだけが未解決」であることをテストで確認する。

#### W1 の実施結果 (#132)

`vite build --mode tauri` を実際に実行して出力を検査した結果である (変更前の出力は `cjs`、`tauri-game.js` から `./index.js` を `require` する循環があり、react などの外部モジュールが `require` で残っていた)。

- 出力形式: ES モジュール。`public/index.js` (入口、約 31 KB。`@tauri-apps/*` と `platform/tauri/*` と `tauriIndex.jsx`) と `public/tauri-game.js` (ゲーム本体と全パッケージ) の 2 ファイル。banner/footer の関数ラップは Tauri では付けない (関数内に `import`/`export` を置けないため)。
- 境界: 入口の `await initPlatform()` の後に `import("./tauri-game.js")` がある。入口にはゲーム側のモジュール (`config.js` など) が入らず、`tauri-game.js` への参照はこの動的 import だけである。ゲーム側のチャンクは初期化前には取得も評価もされない。`inlineDynamicImports` は使っていない (ゲームが入口に巻き上がり、この順序が崩れるため)。入口と共有するモジュール (platform/tauri) は入口に残り、ゲーム側が入口から import する。
- `src/index.html`: Tauri のときだけ `index.js` を `<script type="module">` で読む (出力に ES モジュールの `import`/`export` があるため)。ace、phaser、firebase は従来どおり古典 `<script>` で先に実行される。Electron の `index.html` は変更なし。
- 裸の import はすべてバンドルする。`src/` からの import は `public/node_modules` を先に探し、無ければルートの `node_modules` (`@tauri-apps/*` など) にフォールバックする (`resolvePackagesFromPublic`)。出力で `pug` が `public/node_modules/pug` (3.x) から取り込まれることを確認した (何も指定しないとルートの pug 2 になる)。
- Node 組み込みと `electron` は `tauriUnavailableModules` が、どのプロパティにアクセスしても `The Node module "x" is not available in the Tauri build` を投げるモジュールに置き換える (Vite 既定の空オブジェクトだと `x is not a function` という無関係な失敗になる)。モジュールの読み込み自体は失敗しない (pug などが読み込み時に `require('fs')` だけして、実行経路によっては使わないため)。W2 で `path` などの代替を入れるまでは `path` / `events` / `util` / `assert` / `url` / `process` もこの扱いである (`fs`、`child_process`、`electron` は W2 以降もこのまま)。
- 出力に残る `require` は、コメント内の例、lodash の `freeModule.require` (存在確認つき)、pug の `__require(trPath)` (jstransformer の動的 require。W8) のみである。実行可能なコードに `require("<パッケージ>")` は無い。
- Electron の出力: ベースラインは `origin/main` を別の worktree で `npm ci && npm run build:all` した結果。変更後に同じ条件でビルドし、`public/index.js` / `index.html` / `index.css` の SHA-256 が一致した (`build:tauri` の後は `build:all` で作り直してから比較した)。
- 未解決 (W1 の範囲外): `index.jsx` の `DOMContentLoaded` は、動的 import の後に登録されるため発火済みで呼ばれない (W3、B6)。`index.jsx` の `require('electron')` は上記のとおり読み込み時に明示的に失敗する (W3)。Windows の webview での確認は未実施。
- テスト: `src/test/app/platform/tauri/tauriBundle.test.js` が実際のビルド出力 (メモリ上) に対して上記を検査する。`selection.test.js` は新しい出力形式に更新した。`tasks/clean_build_output.js` の `tauri-game.js` はそのまま必要である。

### W2. Node 組み込みの Tauri 向け代替 (B2、D4)

- 内容: Tauri ビルドのとき `path` / `events` / `util` / `assert` / `url` / `process` を Vite プラグインでブラウザ向け実装に差し替える。`fs_utils.js` の `fileURLToPath` は W5 で扱う。依存の追加 (`events`、`path-browserify`、`util`、`assert` など。ルート `package.json` と lock)。
- 規模: 約 8 ファイル (`vite.config.mjs`、依存宣言と lock、テスト)。
- 依存: W1。
- Electron リスク: なし (Tauri モードのみ)。
- 備考: `moduleAllowlist.js` が公開する `path`/`util`/`assert` は拡張コンテンツが使うので、`moduleAllowlist.test.js` に相当する確認を Tauri 版でも行う。

#### W2 の実施結果 (#133)

`vite.config.mjs` の `tauriBuiltinReplacements` (Tauri モードだけ。Electron のビルドには何も足さない) が、バンドル対象のすべての import (アプリのコードとパッケージの両方。`node:` 接頭辞つきも) に対して次の差し替えを行う。

| 組み込み | Tauri での実装 | 理由 |
| --- | --- | --- |
| `path` | `path-browserify` (POSIX のみ。D4 の (a)) | 定番の小さなパッケージ。Windows のパス意味論は W12 |
| `events` | `events` 3.x | 同上 (ルートの lock に 1.1.1 が `aws-sdk` の依存として入っていたため、直接依存として 3.3 を追加し、`aws-sdk` 側は入れ子になった) |
| `util` / `assert` | `util` 0.12 / `assert` 2.x | `moduleAllowlist.js` が拡張コンテンツに渡すのと同じ API |
| `url` | 自前 `src/js/tauri_shims/url.js` | 旧 API (`parse`/`format`/`resolve`) は npm `url` 0.11、`URL` / `URLSearchParams` は webview のもの、`fileURLToPath` は Node の POSIX 版と同じ挙動 (非 `file:` と host つきは Node と同じく例外)。npm `url` には `fileURLToPath` が無い |
| `process` | 自前 `src/js/tauri_shims/process.js` | `env`、`nextTick` (microtask)、`browser`、`versions` など読み込み時に読まれるものだけ。npm `process` は OS 名を `'browser'` と偽るため使わない。`platform` は `undefined` (W7 で `platform/env` 経由に置き換え済みで、参照するコードは無い) |

- 追加した依存は `path-browserify`、`events`、`util`、`assert`、`url` (ルートの devDependencies。ビルド時にバンドルされるのみ)。`public/package-lock.json` は変更していない。`system.js` の未使用の `import { platform } from 'process'` は、Electron の出力を 1 バイトも変えないため触っていない (Tauri では未使用として除かれ、シムの `platform` は参照されない)。
- 差し替えないもの: `fs`、`child_process`、`electron` は W1 のとおり、プロパティにアクセスすると `The Node module "x" is not available in the Tauri build` を投げる (これらは `platform/*` が受け持つ)。`stream`、`buffer`、`zlib`、`http(s)`、`querystring` (jimp、pngjs、phin が使う。W9) も同様である。グローバルの `process` は定義しない: `system.js:57` と `ValidationHelper.js:59` の `process.platform` は W7 で `platform/env` に置き換えた。`path.resolve` に絶対パスが無いと、path-browserify が `process.cwd()` を呼んで失敗する (W5。`resolve` の呼び出しは約 3 か所)。`fs_utils.js` の `fileURLToPath(new URL('.', document.baseURI))` は、Tauri の `tauri://` では `The URL must be of scheme file` で失敗する (W5)。
- 確認: 出力に 5 つの実装 (`node_modules/path-browserify`、`events`、`util`、`assert`、`url` と `tauri_shims/url.js`) が入り、5 つとも「利用不可」のスタブには置き換わっていないこと (`tauriBundle.test.js`)。`moduleAllowlist.js` を Tauri モードでビルドして、`require`・`process`・`Buffer` が無い `vm` コンテキストで実行し、`path` / `assert` / `util` が動くこと (`tauriBuiltins.test.js`)。シムの単体テスト (`src/test/js/tauriShims.test.js`: `fileURLToPath` は Node と同じ結果)。
- マイルストーン 0 の確認コマンド (`require("` の検査) は、ES モジュール出力になったので `grep -n '^import\|require("' public/index.js public/tauri-game.js | head` に読み替える (入口の `import` は `./index.js` への相対 import のみ)。

### W3. 入口とメニューの切り離し (B5、B6)

- 内容: (1) `index.jsx:8` の `require('electron')` と `index.jsx:88-162` のメニュー構築を `platform/menu.js` に移す (Electron 実装は現在のコードをそのまま移す)。(2) `platform/tauri/menu.js` は D2 の決定に従う (起動マイルストーンでは追加なし)。(3) `DOMContentLoaded` を `document.readyState` で判定する (B6)。(4) `vite.config.mjs` の `platformModules` に `menu` を加え、`selection.test.js` の一致検査 (`Tauri platform parity`) を満たす。
- 規模: 約 6 ファイル (`index.jsx`、`platform/menu.js`、`platform/tauri/menu.js`、`vite.config.mjs`、テスト、`docs/baseline/platform-boundary.md`)。
- 依存: W1 (ビルド確認)。W1 と並行して作ることは可能。
- Electron リスク: 低〜中。`index.jsx` を触る。メニュー構築は移すだけで、項目・順序・タイミング (`Menu.setApplicationMenu` を最後に呼ぶ) を変えない。`document.readyState` の判定は、Electron では常に `loading` の間に評価されるので従来どおり。
- 代替案: `index.jsx` を触らず、Tauri 専用の入口 (`tauriGame.jsx`) に描画ロジックを複製する。Electron のリスクは無いが重複が約 60 行ある。

#### W3 の実施結果 (#134)

- メニュー: `index.jsx` から `require('electron')` / `remote` / `Menu` / `MenuItem` を除いた。`index.jsx` は項目の定義 (`{ label, click }` の配列。dev のときだけ Spector.js の 2 項目を末尾に追加) を作り、`platform/menu.js` の `addHelpMenuItems(items)` に渡す。Electron 実装は元のコードを移したもので、Help サブメニューの取得、"Toggle Developer Tools" が既にあれば追加しない判定、項目の追加順、最後の `Menu.setApplicationMenu` の順序と呼び出し時点 (ゲーム本体の評価中、描画の前) を変えていない。
- Tauri 実装 `platform/tauri/menu.js` (W3 の時点。W10 で置き換え済み): D2 の決定どおり、何もしない関数である (コメントで明示)。JS からアプリケーションメニューを置き換えると、`close.rs` が作る macOS のメニュー (Cmd+Q の終了確認) を壊すため、W10 まで追加しない。DevTools は `tauriShell.js` のショートカットで使える。
- `DOMContentLoaded`: `src/js/app/common/documentReady.js` の `onDocumentReady(document, callback)` が、`readyState === 'loading'` のときだけイベントを待ち、それ以外は即座に実行する。Electron では常に `loading` の間に評価されるので従来どおり、Tauri (動的 import の後) では即座に描画の準備が進む。
- `vite.config.mjs` の `platformModules` に `menu` を追加した (Tauri のビルドでは `platform/menu` が `platform/tauri/menu` に差し替わる)。
- Electron の出力: `index.jsx` が変わるのでバンドルはバイト単位では一致しない。変更前 (HEAD) と変更後の `public/index.js` を diff し、差分が次だけであることを確認した。(1) `index.jsx` 内の `Menu` がなくなったことによる React コンポーネントの内部名 `Menu$1` -> `Menu` の変更 (意味は同じ)、(2) `remote.Menu` の処理が `platform/menu.js` に移ったこと、(3) `document.addEventListener("DOMContentLoaded", ...)` が `onDocumentReady(document, ...)` になったこと。`require("electron")` はバンドル冒頭に 1 回だけ残る (`platform/devtools.js` などと共有)。
- テスト: `src/test/app/platform/menu.test.js` (Electron 実装。`remote` をモック: 項目の順序、`setApplicationMenu` が最後、既存項目があるときは追加しない、Help が無いときは例外)、`src/test/app/platform/tauri/menu.test.js` (Tauri 実装は何も呼ばない)、`src/test/app/common/documentReady.test.js` (`loading` / `interactive` / `complete`、`index.jsx` に `electron` / `remote` が無いこと)。`selection.test.js` の一致検査に `menu` を追加した。
- 手動確認 (ユーザーが実施): Electron (`npm start`): Help メニューに "Toggle Developer Tools"、"Sync Bundled Assets"、"Open User Data"、"Open Save File" の 4 項目がこの順で並び (dev のときは続けて "Show Spector.js UI"、"Capture Frame with Spector.js")、従来どおり動く。Tauri (`npm run tauri -- dev`): 起動してタイトル画面が描画されること (ただし W4/W5 が未完了だと音声の読み込みで止まる可能性がある)。Help メニューの追加項目は出ない (D2。W10 で実装)。macOS で Cmd+Q の確認ダイアログが従来どおり出る。
- 残り: メニュー項目の Tauri 実装は W10。Windows の webview での確認は未実施。

### W4. store を使う呼び出し元の非同期化 (B4、D1)

- 内容: Electron の `platform/store.js` に `getValueAsync` / `setValueAsync` / `hasValueAsync` / `deleteValueAsync` を足す (同期実装を包む)。`ContextProvider.jsx:102`、`audio/index.js:111,131`、`common/context/index.js:77`、`ClearDataButton.jsx:14,16` を `*Async` に切り替える。失敗は握りつぶさずコンソールとダイアログに出す。
- 規模: 約 8 ファイル (上記 5 + `platform/store.js` + テスト 2〜3)。
- 依存: なし (Electron 上でも検証できる)。W1〜W3 の完了を待たずに進められる。
- Electron リスク: 中。永続化のタイミングが同期から非同期に変わる (`setContext` の `setState` コールバック内、`audio.saveState`)。`src/test/app/common/audio.test.js` と `ClearDataButton.test.js` を先に拡張して挙動を固定する。

実施結果 (#135):

- `platform/store.js` (Electron) は `getValueAsync` / `setValueAsync` / `hasValueAsync` / `deleteValueAsync` のみを公開する。`async` 関数の本体で `await` を挟まずに electron-store を呼ぶので、書き込みは呼び出し時点で実行され、例外は rejection になる。Tauri 実装と契約は同じ。
- 同期 API (`getValue` 等) は呼び出し元が無くなったので、Electron と Tauri の両方の契約から削除した (Tauri の `unsupportedSync` も不要になった)。
- 呼び出し元の変更: `ContextProvider.jsx` (保存済みフィールドを schema 順に 1 件ずつ `await`)、`common/context/index.js` (`setValueAsync` を `await` せずに同じ位置で呼び、失敗は報告)、`common/audio/index.js` (`checkLoaded` が `loadState` を待ってから `onload`、`saveState` は失敗を報告)、`ClearDataButton.jsx` (削除を 1 件ずつ `await` し、完了後にコードファイル削除と DB 削除)。
- 初回描画: `ContextProvider.componentDidMount` は元から async で、最初の描画は既定の state、保存値の復元は初期 state を作るパイプラインの中だった。したがって読み込みを `await` に変えるだけで、最終的な state と `setState` の位置は変わらない。audio は `onload` を `loadState` の完了後に呼ぶ (マイクロタスク 1 回分遅れるだけ)。
- 失敗の扱い: `common/reportFailure.js` がコンソールとダイアログに出す。読み込み失敗 (context、audio) は報告後に止まる (context は再 throw、audio は `onload` を呼ばない)。既定値への置き換えはしない。
- 挙動が変わる点: 書き込み失敗は、以前は `setState` コールバック内の同期例外だったが、報告のダイアログに変わる。
- 検証できないこと: 実機 (Electron / Tauri) での動作。テストは store をモックしている。

レビュー対応 (#147):

- 保存の直列化: `setContext` が起こす `setValueAsync` は `common/context/index.js` のキューで 1 件ずつ、呼び出し順に実行する (非同期の store が後の値を先に適用しないため)。失敗した保存は後続を止めず、各呼び出しが自分のエラーを `reportFailure` に渡す。Electron でも書き込み順は変わらない (開始が 1 マイクロタスク遅れる)。
- 消去中の書き込み抑止: `ClearDataButton` は 2 回の確認のあと、`suppressPersistence()` で保存フィールドの永続化だけを止める。メモリ上の context、イベント、`syncContext` は変えず、抑止した書き込みは `console.warn` に出す (黙って捨てない)。キューにある保存を `flushPendingSaves()` で終わらせてから削除する。成功時はリロードまで抑止したまま、失敗時は `resumePersistence()` で再開する。キャンセル時は抑止しない。

- 消去の多重実行防止: `ClearDataButton` は最初のクリックからリロードまで消去を 1 つだけ許す (キャンセルまたは失敗でだけ解除し、再試行できる)。これで、先の消去の最中に後の消去が失敗して `resumePersistence()` を呼び、削除済みのキーが書き戻される経路は無い。

- 同期 fs の除去 (W6 関連): `ClearDataButton` のコード保存先の削除は同期 `remove` から `removeAsync` に変えた (Tauri の `remove` は throw するため。存在しないパスは何もしない点は両実装で同じ)。ストアの削除と同じ `try` に入れたので、削除に失敗したときも永続化を再開し、ダイアログで報告し、リロードせず、再試行できる。W6 の同期 fs 一覧からこの呼び出し元は外れる。

Electron の追加確認 (手動): 設定や進捗を変更した直後にアプリを終了し、再起動して進捗が復元されること。Erase Game Data の実行中に連打しても 1 回だけ動き、リロード後にデータが空であること。

残り: Tauri 実機での設定の永続化確認 (W11)。Tauri の保存先は Electron の `config.json` と別 (R7)。


### W5. 静的パスと URL の集約 (B3、D5)

- 内容: (1) `fs_utils.js` の `staticFilePath` を Tauri では `getResourceDirPath()` を基準にする。Electron 実装は現状のまま。(2) 「絶対パス -> URL」の関数 (例: `platform/assets.js`、`toAssetUrl(absolutePath)`) を新設し、Electron 実装は `file-url`、Tauri 実装は D5 に従う。(3) 呼び出し元を置き換える: `Conversation.jsx:271`、`SpriteSheet.jsx:16`、`useAssetLoader.jsx:22,31,52`、`fs_utils.js:27`、`EntityConfigService.js:271,273`、`Game.jsx:166-212`、`DynamicLevel.js:66-81`、`audio/index.js:171,202,236`、`AvatarSelector.jsx:60`。(4) Worker の URL (`code_runner.js:11`、`ValidationHelper.js:265,348`) は Tauri では相対 URL にする。(5) asset プロトコル (`src-tauri/Cargo.toml` の `protocol-asset`、`tauri.conf.json` の `app.security.assetProtocol`、capability)。
- 規模: 約 18 ファイル。大きければ「(1)(2)(3)(4) の JS」と「(5) の Rust・設定」に 2 PR へ分ける。
- 依存: W2 (`path`)。(5) は独立。
- Electron リスク: 中。呼び出し元を共通関数に置き換えるため。Electron 実装は現在の出力と同一の文字列を返すことをテストで固定する (`fs_utils.test.js`、`useAssetLoader` など)。
- 要確認: ダイアログで選んだディレクトリが asset プロトコルの scope にも自動で追加されるか (`tauri-plugin-dialog` の挙動)。追加されない場合は W9 で scope を足す。

#### W5 の実施結果 (#136)

- 新設: `platform/assets.js` (Electron) と `platform/tauri/assets.js` (`vite.config.mjs` の `platformModules` と選択テストに `assets` を追加)。API は 4 つで、両実装で同名である。`getStaticRootPath()`、`getStaticFileUrl(相対パス)`、`toAssetUrl(絶対パス)`、`toAssetSrc(絶対パス)`。
- Electron 実装は従来の文字列をそのまま返す。`getStaticRootPath` は `fileURLToPath(new URL('.', document.baseURI))` (`fs_utils.js` から移しただけ)、`toAssetUrl` は `file-url`、`toAssetSrc` は入力のパス (生パスのまま Howler・Phaser・`<img>` に渡す現状を保つ。`undefined` は `undefined`)、`getStaticFileUrl` は `fileUrl(path.resolve(root, 相対パス))`。
- Tauri 実装 (種類ごと):
  - `staticFilePath` の基準: `getResourceDirPath()` (`path.resolve(resourceDir, 相対パス)`。基準が絶対パスなので path-browserify の `process.cwd()` 呼び出しは起きない。`config.js` の 2 か所の `resolve` も絶対パス引数で問題ない。テストで固定)。
  - `$RESOURCE` 配下のファイル (`levels/common/music`・`sfx`、`content/`、`avatars/parts`): `frontendDist` に同じ相対パスで埋め込まれているため、ページ相対 URL にする (D5 (2))。asset プロトコルに依存しないので、起動に必須の音声はこの経路で通る。
  - それ以外の絶対パス (ユーザーデータ、ユーザー拡張): `convertFileSrc` (asset プロトコル)。
  - `avatars/avatarN.png`、`code_runner/worker.js` (`getStaticFileUrl`): ページ相対 URL。絶対パスと `..` は throw する。
- asset プロトコル: `tauri.conf.json` の `app.security.assetProtocol` を有効にし、scope は `$RESOURCE/**`、`$CONFIG/terminalquest/**`、`$CONFIG/TerminalQuest/**` だけ (fs の capability と同じ範囲)。`Cargo.toml` の `tauri` に `protocol-asset` feature を追加した。capability の追加は不要 (asset プロトコルは scope だけで制御される)。
- 置き換えた呼び出し元: `fs_utils.js` (`fileURLToPath` と `file-url` を除去)、`audio/index.js` (sfx・music は `toAssetUrl(staticFilePath(...))`、ボイスオーバーは `toAssetSrc`)、`Conversation.jsx`、`SpriteSheet.jsx` (URL かどうかを `file:` 固定ではなくスキームで判定)、`useAssetLoader.jsx`、`Game.jsx` (spritesheets・tilesets)、`EntityConfigService.js` (Phaser の画像)、`loadItemsFromDisk.js` (アイテム画像)、`levelLoader.js` (ミッションアイコン)。`AvatarSelector.jsx`、`code_runner.js`、`ValidationHelper.js` は `staticFileUrl` 経由で、コード変更なしで Tauri 実装に切り替わる。
- Electron との同一性: 上記のとおり関数ごとに従来と同じ式で、`src/test/app/platform/assets.test.js` が `file-url` / 生パス / 旧 `staticFileUrl(絶対パス)` との一致を固定する。既存の `fs_utils.test.js` は無変更で通る。Electron バンドルに Tauri のコード (`convertFileSrc`) は入らない。
- 検証: `npm ci`、`npm run build:all`、`npm run build:tauri` の後に `npm run build:all`、`npm test` (1500 件超) 、`cargo check` / `clippy` / `fmt --check` / `test` が通る。
- 手動確認 (ユーザーが実施): Electron (`npm start`): ゲームが起動し、BGM と効果音が鳴る。拡張機能 (外部拡張を有効にした場合) の画像、ミッションアイコン、インベントリのアイテム画像、アバター選択画面の画像、会話の顔画像、ナビマップが従来どおり出る。Tauri (`npm run tauri -- dev`): タイトル画面が描画される (音声の読み込みが完了する)。DevTools の Network に `levels/common/music/*.mp3` が 200 で出る。
- 残り: `avatarRenderer.js` の `Jimp.read(staticFilePath(...))` (W9)、`tiled.js` / `levelLoader.js` が読むレベルの map・画像 (W8、W9 以降)、`HackInterface.jsx` などのディスク読み取り、ダイアログで選んだ拡張機能ディレクトリが asset プロトコルの scope に入るかの実機確認 (R2。入らない場合は W9/W10 で `asset_protocol_scope` を足す)、Windows のパス (W12)。dev でのリソースの相対 URL (`frontendDist` の埋め込み) は実機でのみ確認できる。

### W6. 同期 fs / exec の置き換え (B4)

- 内容: `Game.jsx:228` の `list` を `listAsync` に、`ClearDataButton.jsx:56` の `remove` を `removeAsync` に、`ValidationHelper.js:173` の `pathExistsSync` を `existsAsync` に、`system.js:25` の `readFileSync` を非同期の読み取りに替える (`isPi` と `initializeSystemInfo` を `async` に)。Tauri では `/proc/cpuinfo` が fs scope 外なので、Linux 判定の扱いを決める (D6: Raspberry Pi 判定を Tauri では行わないと記録する、または scope を足す)。
- 規模: 約 6 ファイル + テスト。
- 依存: なし。W4 と同じファイル (`ClearDataButton.jsx`) を触るので、W4 のあとに行うか同じ PR にまとめる。
- Electron リスク: 低 (置き換え先は Electron にも既存の非同期 API。`sync-api.md` の対象)。`Game.jsx` は `Promise.all` の順序とログ順を維持する。

#### W6 の実施結果 (#137)

- 監査: main では `Game.jsx` の `list` (#150) と `ClearDataButton.jsx` の `remove` (W4) は置換済みだった。アプリのコードに残っていた同期呼び出しは 2 か所で、`ValidationHelper.js` の `platformExec.pathExistsSync` と `system.js` の `readFileSync('/proc/cpuinfo')` である。`src/js` と `public/content` で `exists(` `list(` `read(` `remove(` `readFileSync` `pathExistsSync` を洗い出した (`public/content` の `exists(helper, ...)` は validator 自前の非同期関数で、fs ではない)。
- 設計: (1) `platform/exec` に `pathExists(path): Promise<boolean>` を追加した。Electron は `async path => fs.existsSync(path)` で従来の判定そのまま (Windows Store の `WindowsApps` で jetpack/`fs.stat` が失敗する問題を避ける理由は `exec.js` のコメントに残した。`existsAsync` には置き換えていない)。Tauri は `existsAsync` (非同期 `stat`) で、ENOENT だけを `false` とし、scope 外のパスなど他の失敗は reject する (黙って `false` にしない)。(2) `system.js` は `readFile('/proc/cpuinfo', { encoding: 'utf8' })` を `await` し、`isPi` と `initializeSystemInfo` を `async` にした。従来どおり読み取り失敗は `try/catch` で `false` (Electron の現行挙動。欠損や権限エラーを同じに扱う)。`ContextProvider.jsx` は `pipeAsync` 内なので呼び出し側の変更は不要。(3) Tauri の capability に `fs:allow-read-text-file` の scope として `/proc/cpuinfo` だけを追加した (読み取りのみ、`**` なし)。
- 同期メンバーの削除: 呼び出し元が無くなったので、`platform/fs` の `exists` / `list` / `read` / `remove` / `readFileSync` と `platform/exec` の `pathExistsSync` を Electron と Tauri の両方から削除した (W4 の store と同様)。Tauri の `unsupportedSync` と `ERR_TAURI_SYNC_UNSUPPORTED` も不要になったので削除した。API の一致は `selection.test.js` の一致検査が見る。
- テスト: `system.test.js` (BCM 型番ごとの判定、部分一致・未列挙・`Hardware` 行なし・空は `false`、読み取り失敗は reject せず `false`、`os` がある場合は再判定しない、`pi` の上書き、元の state を変更しない、`utf8` で `/proc/cpuinfo` を読む)、`ValidationHelper.test.js` (トリムしない元のパスを `pathExists` と `exec` に渡す、`pathExists` の reject は伝播)、`platform/exec.test.js` と `execIntegration.test.js` (Electron の `pathExists`)、`platform/tauri/execDevtools.test.js` (Tauri の `pathExists`: 存在、ENOENT で `false`、他の失敗は reject)、`platform/fs.test.js` と `platform/tauri/fs.test.js` (同期メンバーが無い、`listAsync` と `readdir` の順序一致)。`system.js` の判定は変更前のコードでも同じテストが通ることを確認してから置換した。
- 検証: `npm ci`、`npm run build:all`、`npm run build:tauri` の後に `npm run build:all`、`npm test`、`cargo check` / `clippy` / `fmt --check` / `test`。
- 手動確認 (ユーザーが実施): Electron (`npm start`): 起動する。実行ファイルを求める objective (例: Node のパスを入力する課題) で、存在しないパスを入れると "The path you provided does not exist!"、正しいパスで成功する。Windows Store 版のアプリのパスは Windows でのみ確認できる。Tauri (`npm run tauri -- dev`): 起動時のコンソールに `/proc/cpuinfo` や `ERR_TAURI_SYNC_UNSUPPORTED` に関するエラーが出ない。Linux で DevTools から新規セーブの `systemInfo.pi` が `false` (Raspberry Pi 以外) であること。
- 残り: ユーザー指定の実行ファイルのパスは Tauri の fs read scope の外なので `pathExists` は reject していた (W11 #142 で専用の Rust command `path_exists` に置き換えて解決)。Windows Store の挙動の実機確認 (W11 #142 で `symlink_metadata` の確認を足したが Windows では未検証)。`Game.jsx` の共通エンティティ読み込みの抽出テストは今回の範囲外 (#150 で `listAsync` 化済み)。

### W7. OS 判定 (`process.platform`) の置き換え (B2)

- 内容: `platform/env.js` に `getPlatform()` を追加する。Electron は `process.platform`、Tauri は `initPlatform` で `@tauri-apps/plugin-os` の `platform()` を読み、同期で返す (`os:allow-platform` は付与済み)。`system.js:2,57` と `ValidationHelper.js:59` を置き換え、未使用の `import { platform } from 'process'` を削除する。値は Node の `process.platform` と同じ語彙 (`darwin` / `win32` / `linux`) に変換する。
- 規模: 約 7 ファイル。
- 依存: W2 (`process` の代替が無くてもよい状態にするため、W7 の後に W2 の `process` 代替を外せる)。
- Electron リスク: なし (同じ値を返す)。

#### W7 の実施結果 (#138)

- 監査: `src/js` と `public/content` の `process.platform` / `process.env` / `process.*` を洗い出した。アプリのコードで読んでいたのは `system.js:57` (`systemInfo.os`) と `ValidationHelper.js:59` (`helper.platform`) の 2 か所、未使用の `import { platform } from 'process'` (`system.js:2`)、`platform/exec.js:102` (`commandExists`。Electron 実装なので Tauri のビルドには入らない。触っていない) である。ほかの `process.env` はコメントと、ワーカーに渡す `env` オプションの説明だけで、`process` を読むコードではない。`public/content` に `process.*` を読むものは無く、検証コードは `helper.platform` だけを使う (`fs-08-hidden/validator.js`)。`public/content` は変更していない。
- 設計: `platform/env.js` に `getPlatform()` を追加した。Electron は呼び出しのたびに `process.platform` を返す (従来の読み取りと同じ値・同じ時点)。Tauri (`platform/tauri/env.js`) は `initPlatform()` が `@tauri-apps/plugin-os` の `platform()` を読んで保持した値を同期で返し、初期化前に呼ぶと `getPlatformState` が明示的なエラーを投げる。変換は `macos` -> `darwin`、`windows` -> `win32`、`linux` -> `linux` の 3 つだけで、それ以外 (`ios`、`android`、`freebsd` など) は `Unsupported operating system ...` で `initPlatform()` を reject する (既定値なし)。`platform()` は同期だが、例外を `rejectAsError` に通すために `Promise.resolve().then` で包んでいる。
- 置き換え: `system.js` は `getPlatform()`、`ValidationHelper.js` は `this.platform = getPlatform()` (コンストラクタで呼ぶ。Tauri では初期化後に作られる)。`system.js` の未使用 `import { platform } from 'process'` は削除した。`os:allow-platform` は付与済みで、Rust 側 (`tauri_plugin_os::init()`) も登録済みなので、capability と Rust は変更していない。
- テスト: `platform/env.test.js` (Electron は `process.platform` を呼び出しごとに返す)、`platform/tauri/platformEnv.test.js` (初期化前の例外、3 つの変換、未対応値と値なしで reject して未初期化のまま)、`context_provider/system.test.js`、`ValidationHelper.test.js` (`helper.platform` が `getPlatform()` の値)、`platform/noDirectProcessPlatform.test.js` (`platform/` の外に `process.platform` と `from 'process'` が無い)。`initPathsEnv.test.js` は OS プラグインの値を用意するよう更新した。API の一致は既存の `selection.test.js` の一致検査 (`env`) が見る。
- 残り: `tauri_shims/process.js` の `platform` は `undefined` のまま (参照するコードが無くなったので、W2 のシムから `process` を外せるかは別途判断)。Windows と Pi (`isPi`) の判定は範囲外。
- 手動確認 (ユーザーが実施): Electron (`npm start`): 新規セーブでも従来どおり起動し、`fs-08-hidden` のレベルで macOS/Linux は `.sneaky.txt`、Windows は `sneaky.txt` を期待する (値が従来と同じ)。Tauri (`npm run tauri -- dev`): 起動時に `Unsupported operating system` や `used before initPlatform()` のエラーが出ないこと。DevTools で新規セーブの `systemInfo.os` が macOS なら `darwin`、Windows なら `win32` であること。

### W8. 会話 (pug / cheerio) の Tauri 対応 (B7)

- 内容: `Conversation.jsx:224` の `pug.renderFile` を、`platform/fs` で読んだ文字列を `pug.render` に渡す形にする (`filename` を渡す)。`include` を使う 1 ファイルの扱いを決める (事前展開か、`include` 解決をローダーに持たせる)。`cheerio` のブラウザ動作を確認する。
- 規模: 約 4 ファイル。
- 依存: W2、W5 (`resolveAbsolutePath` の扱い)。
- Electron リスク: 低 (Electron でも `pug.render` + 文字列で同じ結果)。会話の出力が同一であることを既存の `.pug` 全件の比較テストで確認する。

#### W8 の実施結果 (#139)

- 設計: 新しい platform モジュール `platform/conversationTemplate.js` (`renderConversationTemplate(absolutePath, context)`、Promise で HTML を返す)。Electron 実装は従来どおり `pug.renderFile(absolutePath, context)` をそのまま呼ぶ (context が locals と pug のオプションを兼ね、pug が `context.filename` を書く挙動も同じ)。Tauri 実装 (`platform/tauri/conversationTemplate.js`) は、ルートの `.pug` を `platform/tauri/fs` の `readFile` (UTF-8) で読み、Pug 3 の `read` プラグインフックで `include` / `extends` を解決する。フックは同期なので、まだ読んでいないファイルを要求されたら、pug が解決したパスを持つ目印のエラーを投げ、そのファイルを非同期に読んで map に足し、コンパイルをやり直す (1 回ごとに 1 ファイル増えるので必ず終わる)。解決、ネスト、エラー位置は pug 自身が処理する。読み取りに失敗したファイルは同じ `code` (ENOENT) のエラーとして pug に投げ直させ、Electron と同じ ` at <file> line <n>` が付く。`Conversation.jsx` は `pug` の import をやめ、このモジュールを使う。`cheerio` は従来どおり直接 import している。
- Tauri バンドルの調査 (実際のビルド出力と、Node のグローバルが無い `vm` コンテキストでの実行): pug と cheerio は `public/node_modules` の版 (pug 3.0.2、cheerio 1.0.0-rc.10) がバンドルされる。cheerio は `stream` / `buffer` / `zlib` に触れない (parse5 と htmlparser2 の同期 API のみ)。ただし pug の依存に Tauri で壊れる箇所が 3 つあり、W1/W2 の「読み込みは失敗しない」前提が成り立っていなかった。(1) `jstransformer/index.js` が読み込み時に `if (fs.readFile)` を評価し、`fs` の失敗スタブがここで投げる。pug を import する `Conversation.jsx` はゲームの読み込み時に評価されるので、このままだと Tauri でゲームが起動しない。(2) 同じく読み込み時に `resolve` パッケージが `fs.realpath` を読む。(3) `pug/lib/index.js` が `include` ごとに `Buffer.isBuffer(contents)` を呼び、webview には `Buffer` が無いので `include` を使う会話が ReferenceError になる。
- 対応 (Tauri ビルドのみ、`vite.config.mjs`): `patchTauriPackages` が (1) `jstransformer` の `require('fs')` を `{}` に、(3) pug の `Buffer.isBuffer` 判定を文字列か否かの同等の判定に、バンドル時に置き換える (パッケージ側が想定している「`fs.readFile` が無い」分岐。置換前の文字列が見つからなければビルドを失敗させる)。(2) は `pug-filters/lib/run-filter.js` が読む `resolve` だけを、Node 組み込みと同じ失敗スタブにする (フィルターを使うときだけ呼ばれる)。pug のフィルター (`:name`) は Tauri では使えない (`unknown filter` のエラー。リポジトリの `.pug` には使っているものが無い)。Electron の出力は変えていない。DOMParser への置き換えは不要だったので行っていない (R4 の cheerio 部分は解消)。
- 差分 (Tauri): ファイルは `platform/fs` 経由で読む (capability の scope が適用される)。ファイルが無いときのエラーは `code` と ` at <file> line <n>` が Electron と同じで、本文はプラグインのメッセージ。
- テスト: `platform/conversationTemplate.test.js` (Electron の契約: 描画結果、`context.filename`、`setState` の副作用、include / extends / mixin、cheerio の解析結果、エラー)、`platform/tauri/conversationTemplate.test.js` (Tauri が Electron と同じ HTML / `filename` / `setState` 呼び出し / エラーを返すこと。リポジトリの全 `.pug` 111 件を、空の状態と「すべて設定済み」の状態、および描画された全 `response` の `lastResponse` で比較)、`platform/tauri/conversationBundle.test.js` (Tauri ビルドで作った実際のバンドルを、`require` / `process` / `Buffer` が無い `vm` で実行し、全 `.pug` が Electron と同じ結果になること、`include` が fs プラグインだけで読まれること)。`selection.test.js` は新モジュールを一致検査に含める。Vitest は `pug` / `cheerio` を `public/node_modules` の版へ向ける (ルートには pug 2 と cheerio rc.3 がある)。
- 残り: Tauri 上の実機確認 (下記)、ゲーム全体のバンドルを実行したときの他の「読み込み時に失敗スタブへ触る」箇所 (会話以外の依存。今回調べたのは会話の経路だけ)、`resolveAbsolutePath` が返すパスの形 (W5) と asset の scope は W5 の結果に従う。
- 手動確認 (ユーザーが実施): Electron (`npm start`): NPC と会話し、ダイアログの文章、返答の選択肢、アバター画像が従来どおり出る。返答を選ぶと次の発言になり、選択肢を使い切って `<end conversation>` で閉じられる。`include` を使うのは JavaScript ミッションの科学者 (`scientist1.pug`)。Tauri (`npm run tauri -- dev`): 起動時に `The Node module "fs" is not available` / `Buffer is not defined` が出ないこと。同じ NPC との会話で、Electron と同じ文章と選択肢が出ること (DevTools のコンソールにエラーが無いこと)。

### W9. アバター (jimp) の Tauri 対応 (B7)

- 内容: `avatarRenderer.js:44-65` の `Jimp.read(staticFilePath(...))` を URL 入力にする (W5 の関数を使う)。ブラウザ向けの `jimp` が bundle できることの確認。動かなければ Canvas で合成する案を別途検討する (挙動変更になるため要相談)。
- 規模: 約 3 ファイル。
- 依存: W5。
- 補足 (#154): Tauri ビルドの `jimp` は、起動を通すためにブラウザ用バンドルへ向けている (`vite.config.mjs` の `resolvePackagesFromPublic`)。
- 実施結果 (#140):
  - 変更: `avatarRenderer.js` の部品画像の入力を `toAssetSrc(staticFilePath('avatars/parts/...'))` にした (小さな関数 `partInput` 経由。部品名、分岐、着色、合成、PNG 出力、callback は変えていない)。Electron の `toAssetSrc` はパスをそのまま返すので、`Jimp.read` に渡る文字列は従来と同じ。Tauri はリソース配下のパスをページ基準の URL (`tauri://localhost/avatars/parts/body.png`) にする。`vite.config.mjs` は、jimp のブラウザ用バンドルが無いときに明示的なエラーでビルドを失敗させる (通常解決へのフォールバックは無い)。
  - 確認したブラウザ用 jimp (0.16.1、`browser/lib/jimp.js`) の API: `Jimp.read(URL)` (XHR)、`color([{apply:'mix',...}])`、`composite`、`getBase64Async(Jimp.MIME_PNG)` は Node 版と同じ形で存在する。ファイルパスの読み込みは内蔵の空の `fs` で不可 (URL のみ)。画像の取得が HTTP 4xx のときは reject する (`HTTP Status 404 for url ...`)。
  - テスト: `common/avatarRenderer.test.js` (Electron の契約: 読み込み入力と順序、着色パラメータ、合成順、PNG 出力。jimp は記録用のモック)、`platform/tauri/avatarTauriBundle.test.js` (実際の `--mode tauri` の設定でビルドした avatarRenderer を、`require` / `process` / `Buffer` が無い jsdom で実行し、部品画像を URL で要求し、ブラウザ用 jimp が合成した PNG が Electron 側 (Node 版 jimp、ファイルパス) の PNG と全画素で一致すること、5 通りの組み合わせ)、`selection.test.js` (Electron の出力に `require("jimp")` が残る)。
  - Electron の出力 (`public/index.js`) の差分: `Jimp.read` の引数の式だけ (`staticFilePath("...")` が `partInput("...")` になり、`partInput` の定義 1 つが加わる)。
  - 残り: 実際の Tauri の webview での確認 (下記)。`$RESOURCE` の部品画像が `frontendDist` から配信されるかは実機でのみ確認できる。Windows のパスは W12。
- 手動確認 (ユーザーが実施): Electron (`npm start`): 新規のセーブでオンボーディングに進み、カスタムアバターの作成画面で肌、目 (眼鏡を含む)、髪型 (髪なしを含む)、髪色を変えるたびにアバターが表示される。確定したあと、保存されたアバターがゲーム内 (ステータスやダイアログ) に表示される。Tauri (`npm run tauri -- dev`): 同じ操作で同じ表示になる。DevTools のコンソールに `HTTP Status` や `Could not load` のエラーが無く、Network に `avatars/parts/*.png` が 200 で出る。
- Electron リスク: 低〜中 (Electron では従来のファイルパスの入力のまま)。

### W10. メニュー項目と拡張機能ディレクトリ (B5、B8)

- 内容: (1) Help メニューの "Sync Bundled Assets" / "Open User Data" / "Open Save File" を Tauri の menu API で実装する (D2)。(2) ダイアログで選んだ拡張機能ディレクトリの scope (fs と asset プロトコル) を再起動後も保つ (`tauri-plugin-persisted-scope` の導入、または選択パスの保存と起動時の再許可)。
- 規模: 約 8 ファイル (Rust、capability、`platform/tauri/menu.js`、テスト)。
- 依存: W3、W5。
- Electron リスク: なし (Tauri のみ)。

#### W10 の実施結果 (#141)

設計 (CodeRabbit の計画のうち、実コードと crate の版 (tauri 2.12.5、persisted-scope 2.4.3) で確認できたものを採用):

- メニュー: `src-tauri/src/help_menu.rs`。macOS では `close::install_quit_menu` が設定したメニューの既存 Help サブメニュー (`HELP_SUBMENU_ID`) に、無効状態の項目を追加する (`set_menu` は呼ばないので `quit-with-confirmation` はそのまま)。Windows / Linux では Tauri 2.12.5 の Builder が既定メニューを作らない (`app.rs` の既定メニューは macOS のみ) ので、Help だけのメニューを設定する (メニューバーに Help だけが出る。以前は何も無かった)。項目は Electron と同じ順序と文言 (Toggle Developer Tools、Sync Bundled Assets、Open User Data、Open Save File)。
- クリック: `on_menu_event` が項目 ID を `help-menu-click` イベント (宛先 `main`) として転送する。JS (`platform/tauri/menu.js`) は `listen` を先に呼び、完了してから `enable_help_menu` を呼ぶので、listener が無い状態でクリックされることは無い (Vitest で呼び出し順を固定)。ID・ラベル・イベント名は Rust と JS で同じ文字列を使い、Vitest が両ファイルの一致を検査する。
- 各項目: Sync は共通の `click` (`index.jsx` の配列) を再利用する。Toggle は `platform/devtools` を直接呼ぶ (debug ビルドのみ項目を作る。release の DevTools コマンドは常に失敗するため、Electron と違い release では項目を出さない)。Open User Data / Open Save File は、共通の callback が指す互換パス (`$CONFIG/terminalquest`、`config.saveFilePath`) が Tauri の実データの場所と異なるので使わない。実際の store (`$APPDATA/config.json`、`$APPDATA` はアプリ識別子を含む。`resolve_store_path` で確認) の置き場である app data ディレクトリと `config.json` を opener で開く (capability は `$APPDATA` と `$APPDATA/config.json` の 2 件だけ。`**` なし)。store が未作成 (まだ何も保存していない) なら OS のエラーをダイアログに出す。失敗はすべてコンソールとダイアログに出し、握りつぶさない。
- 項目にしないもの: dev 専用の Spector.js 2 項目 (Tauri の webview での動作が未確認のため。`items` に含まれていても Tauri では無視する)。
- scope の永続化: `tauri-plugin-persisted-scope` 2.4.3 (feature `protocol-asset`) を fs の後に登録。plugin-dialog の `open({ directory: true })` は fs の scope と asset プロトコルの scope の両方に追加する (ソースで確認) ので、どちらも復元される。永続化の対象・リスクは `tauri-platform.md` 1.4 章に記録した (`.persisted-scope*`、静的 scope の絶対パスも保存、取消し API なし、失敗を通知しない、renderer の store からの到達)。
- Sync Bundled Assets の同期先 (レビュー指摘): 共通 callback は `<拡張ディレクトリ>/.bundled` を `removeAsync` (`lstat` + `remove`) し、`.bundled/tilesets` と `.bundled/objects` に `mkdir` / `copyFile` する。タイルセット画像はアセットプロトコルで読む。dialog が許可するのは `<dir>` と `<dir>/**` だが、Unix では `require_literal_leading_dot` が既定で true のため `**` は `.bundled` に一致せず、拒否される (Rust の単体テストで確認)。対策として `src-tauri/src/bundled_scope.rs` が、fs とアセットの scope に `<dir>` が許可されるたびに `<dir>/.bundled` と `<dir>/.bundled/**` だけを追加する (起動時の persisted-scope の復元も同じ経路を通るよう、fs の後・persisted-scope の前に登録)。`requireLiteralLeadingDot` を false にする全体設定はしない。
- 変更しないもの: Electron のコードすべて (`index.jsx`、`platform/menu.js`)、`close.rs`。
- テスト: Rust `help_menu.rs` (ID / ラベルの一意性、`quit-with-confirmation` と衝突しない、debug / release の項目、ID 判定。`cargo test`)。Vitest `platform/tauri/menu.test.js` (Tauri API をモック: listen → enable の順序、listen / enable の失敗の通知、各項目の動作、store 未作成の通知、不明な ID、Rust との ID 一致)。`tauriBoot.test.js` (起動時に `plugin:event|listen` が `enable_help_menu` より前に呼ばれる。`tauriBootBootstrap.mjs` に 2 つの IPC 応答を追加)。
- Electron の出力: `vite build` (Electron) の `public/index.js` の SHA-256 が変更前 (main be3d647) と同一であることを確認した (`npm run build:tauri` の後に `npm run build:all` で作り直して比較)。
- 検証できていないこと (実機のみ): ネイティブメニューの表示、macOS の Cmd+Q の確認、Help の追加項目の動作、persisted-scope が実際に再起動後の読み取りを許可すること。
- 手動確認 (ユーザーが実施。`npm run tauri -- dev`):
  1. Help メニューに "Toggle Developer Tools"、"Sync Bundled Assets"、"Open User Data"、"Open Save File" がこの順で出て、起動直後から有効 (グレーアウトしない)。Windows / Linux ではメニューバーに Help だけがある。
  2. "Toggle Developer Tools" で DevTools が開閉する。"Sync Bundled Assets" でコンソールに `Syncing bundled assets...` と `Bundled assets synced!` が出る。"Open User Data" で `~/Library/Application Support/com.terminalquest.desktop` (OS ごとの app data) がファイラで開く。"Open Save File" で同ディレクトリの `config.json` が既定のアプリで開く (一度も保存していないとエラーダイアログが出る)。
  3. macOS: Cmd+Q と、アプリメニューの Quit "Quit TerminalQuest" で、従来どおり確認ダイアログが出る (Cancel で継続、OK で終了)。ウィンドウを閉じても確認が出る。
  4. 設定画面で拡張機能のディレクトリ (静的 scope の外、例: `~/Documents/quest-ext`) を選び、拡張機能が読み込めることを確認する。アプリを終了して再起動し、再選択せずに同じ拡張機能のファイルと画像が読み込める (fs とアセット画像の両方)。`~/Library/Application Support/com.terminalquest.desktop/.persisted-scope` と `.persisted-scope-asset` ができている。
  5. 選んでいないディレクトリ (例: `~/Desktop`) は再起動後も読めない (許可が広がっていない)。

### W11. コード実行・検証の実機確認と修正 (B3 の Worker、B8)

- 内容: `QuestIDE` の保存 (`$CONFIG/TerminalQuest/QuestIDE`)、`code_runner/worker.js` の Worker 起動 (`tauri://` オリジン)、`helper.exec` の許可リスト (`python3`、`git`、`node`)、`ValidationHelper` の fs 契約を実機で確認し、必要な修正をする。
- 規模: 不明 (確認の結果次第。見込み 3〜6 ファイル)。
- 依存: W5、W6。
- Electron リスク: なし (Tauri 側の修正のみ。共通コードを触るときは別 PR)。

#### W11 の実施結果 (#142)

実機 (WebView) を使わずに確認できる範囲を確認し、直したのは (4) だけである。共通の JS (Electron と共有するコード) は変更していない。

1. QuestIDE の保存先 (`$CONFIG/TerminalQuest/QuestIDE/<level>/<objective>/user_code.js`)。使う操作は、保存 = `mkdir` (親、recursive) + `write_text_file`、読み込み = `stat` + `read_text_file`、validator = `read_text_file`、Clear Data = `lstat` + `remove`。実際の capability (`platform.json`) の各 fs permission の scope を、Tauri の本物の scope 判定 (`tauri::fs::Scope`。tauri-plugin-fs の `resolve_path` と同じ作り方) で評価する Rust テスト (`src-tauri/src/capability_scope.rs`) を足した。結果: 全操作が許可される。ギャップは無く、scope は変更していない (最も狭いまま)。`$CONFIG` 外、`TerminalQuestX` のような接頭辞だけ同じ兄弟、ホームの下、`/tmp` には書けず、`$RESOURCE` は読み取りのみ。残り: プラグインが scope の前後で行うシンボリックリンクの解決と ACL そのものは WebView が要るので未確認。
2. Worker の起動。URL は `getStaticFileUrl('code_runner/worker.js')` (W5) で、ページ相対の同一オリジン URL (`tauri://localhost/...`、Windows は `http://tauri.localhost/...`。Vitest `workerUrl.test.js` で固定)。`public/code_runner/worker.js` は `frontendDist` (`../public`) に入り、バイナリに埋め込まれたものがディスクのファイルとバイト一致することを Rust テスト (`lib.rs` の `tests`。`generate_context!` を `context()` に切り出して共有) で確認した。worker.js は import / export / `importScripts` の無い classic script (Vitest で固定) で、`new Worker(url)` に渡す形は変えていない。CSP は `csp: null` (未設定) なので `worker-src` に制限は無い (Rust テストで固定。CSP を足すときはこのテストが落ちるので、`worker-src 'self'` を足すこと。W12)。残り: WKWebView / WebView2 / WebKitGTK で `new Worker('tauri://localhost/...')` が実際に動くか (調べた範囲では、`tauri://` で問題が報告されているのは service worker で、dedicated worker の報告は見つからなかった。未確認)。
3. `helper.exec` の許可リスト。`ValidationHelper` の `exec` / `commandExists` / `isExecutableValid` が Rust に送る引数を、Tauri の `exec` 実装に `mockIPC` をつないだ Vitest (`validatorExec.test.js`) で固定した (`run_command` の引数、シェルを介さない、許可外は `notAllowed`、`isExecutableValid` の文字列は厳密解析されて `run_command` に届く、非ゼロ終了のメッセージ)。`public/content` の validator が名指しするプログラムを走査するテストも足した: リテラルで指定しているのは `git` と `powershell.exe` で、`powershell.exe` 以外は許可される。残りの呼び出し (`TQ_GIT_EXE`、`TQ_NODE_EXE`、`TQ_PYTHON_EXE`、`isExecutableValid` に渡す入力) は学習者が入力するパスで、ファイル名が `git`、`node`、`npm`、`python`、`python3`、`python3.*` (`.exe` は除く) に合えば動く。ギャップ: (a) `fs-08-hidden` の win32 の分岐は `powershell.exe` を呼ぶので Tauri では `notAllowed` になる。PowerShell は `-Command` で何でも実行できる (シェルと同じ) ので許可リストには足していない。選択肢は、validator を PowerShell なしにする (Windows の隠し属性を見る手段が fs plugin に無いため、専用の Rust command が要る)、または `powershell` を許可する (許可リストの意味が変わる)。Windows のみで、W12 (Windows) と合わせて決める。(b) `py.exe`、`python-3.12`、`pypy` などファイル名が別名の実行ファイルは拒否される (許可パターンを足せば通る。2.2 章のとおり)。
4. 実行ファイルのパスの存在確認。`pathExists` は、ユーザー指定のパスが fs の read scope の外なので reject していた (W6)。fs の scope を広げる (任意の場所の `stat` を許す) 代わりに、既存の Rust のセキュリティモデルを使う専用の command `path_exists` を足した。`run_command` と同じ `authorize_program` を通し、絶対パスでファイル名が許可パターンに合うものだけ答える (許可名以外は `notAllowed` で reject、相対パスは `false`)。返すのは存在の 1 ビットで、一覧も読み取りもしない。許可パターンは capability の `allow-path-exists` に `allow-command-exists` と同じ 6 件を宣言した (権限の追加は `build.rs` の manifest と `permissions/autogenerated/path_exists.toml`)。トレードオフ: webview から「`<任意のディレクトリ>/git` などが存在するか」を調べられる (許可名のファイルの有無だけ。内容も一覧も出ない)。`run_command` はもともとこの名前のファイルを実行できるので、新しい能力は存在確認だけである。Electron の `existsSync` との差: 許可名以外のパスは、Electron では存在すれば成功するが、Tauri では `notAllowed` で reject する (どのみち `run_command` で起動できないパスなので、起動できないものを「存在する」と返さない)。このとき `isExecutableValid` は例外を投げ、validator の `catch` が「予期しないエラー」を表示する (メッセージに `program is not allowed` が付く validator もある)。
- Electron の出力: 共有の `src/js` は `platform/tauri/exec.js` (Tauri 専用) 以外変更していない。`public/index.js` の SHA-256 は変更前と同一 (下記の検証)。
- 検証: `npm ci` (クリーン)、`npm run build:all`、`npm run build:tauri` の後に `npm run build:all`、`npm test`、`cargo fmt --check` / `clippy --all-targets -D warnings` / `test`。
- 検証できていないこと (実機のみ): Worker が実際に起動すること、保存したコードの読み書きが実機の scope で通ること、`path_exists` の command が capability の ACL で実際に呼べること (ビルドは manifest と capability の整合を検査するが、呼び出しは WebView が要る)、Windows (`WindowsApps`、`powershell.exe`)。
- 手動確認 (ユーザーが実施。`npm run tauri -- dev`):
  1. 設定で拡張機能を読み込めている状態で、コードを書く課題 (QuestIDE が開く課題) を開き、エディタにサンプルコードが出る。`console.log('hello')` を書いて Run (再生ボタン) を押すと、コンソールに `Executing your program...` に続けて `hello` が出る。無限ループ (`while(true){}`) を書いて Run するとハングせず UI が応答する (Worker なので)。DevTools の Network に `code_runner/worker.js` が 200 で出る。
  2. 書いたコードがディスクに残る: `~/Library/Application Support/TerminalQuest/QuestIDE/<level>/<objective>/user_code.js` ができている。アプリを再起動して同じ課題を開くと、書いた内容が復元される。Clear Data の後はこのディレクトリが消える。
  3. validator: `python3` と `git` が PATH にある環境で、Python のインストール確認の課題 (python_basics_install) と Git の課題 (03_install_git) に、`which python3` / `which git` の絶対パスを入れて合格する。`create_repo` (JS ワークスペース) の課題が `git` を呼べる。
  4. 実行ファイルのパスの課題: 正しいパスで成功し、存在しないパス (例: `/nope/python3`) では "The path you provided does not exist!" が出る。`/bin/ls` のようなファイル名が許可外のパスではエラーが出る (上記のトレードオフ。Electron とは異なる)。名前だけ (`git`) は "does not exist" になる。
  5. 起動時のコンソールに `forbidden path` や `Permission ... not found` が出ない。

### W12. 配布ビルド (後続、#63 の周辺)

- 内容: `frontendDist` から `content/`、`levels/` の重複を除く (`tauri-resources.md` 5 章)、`public/node_modules` の埋め込みを絞る、CSP (`csp: null` の見直し)、Windows のパス意味論 (D4 の (b))、`tauri build` の確認、Electron からの保存データ移行の要否。
- 規模: 約 6〜10 ファイル。
- 依存: W1〜W11。
- Electron リスク: なし。

### 起動時の失敗の修正と起動テスト (#154)

- 症状: Tauri ビルドがローディング画面から進まず、コンソールに `TerminalQuest failed to start: Error: The Node module "fs" is not available in the Tauri build (accessed readFileSync)` が出る (`./local_config` の `Cannot find module` は `config.js` が捕まえて記録するだけのログで、原因ではない)。
- 原因 (実際の出力 `public/tauri-game.js` と、後述の起動テストで確認): `tauriIndex.jsx` の `await import('./index.jsx')` が、ゲームのバンドルの評価中に失敗して reject される。W8 の「読み込み時に失敗スタブへ触る依存が他に無いか」の調査 (「残り」の項) が、会話の経路以外では未実施だった。見つかった読み込み時の失敗は 2 つ。
  1. `ejs` (2.6.2、`ObjectiveDescription.jsx` が import) の `lib/ejs.js` が、読み込み時に `exports.fileLoader = fs.readFileSync;` を実行する。`fs` は失敗スタブなので、このプロパティ参照で投げる (ユーザーのコンソールの `accessed readFileSync`)。
  2. `jimp` (0.16.1、`avatarRenderer.js` が import) の Node 用エントリが、読み込み時に `process` (`@jimp/core/es/request.js`)、続いて `stream` (`util.inherits(..., stream)`) に触る (`Buffer` も使う)。webview にはどれも無い。
  `jstransformer` の `fs.readFile` (W8 で対応済み) 以外の `readFileSync` の参照は、関数の中 (呼び出し時) にあり、読み込みは妨げない (`pug` の `load.read`、`pug-runtime`、`ejs` の `fileLoader()` 関数など)。
- 対応 (Tauri ビルドのみ、`vite.config.mjs`。Electron の出力は変えていない):
  1. `patchTauriPackages` に `ejs/lib/ejs.js` を追加し、`exports.fileLoader = fs.readFileSync;` を、呼ばれたときに初めて `fs.readFileSync` を参照して委譲する関数に置き換える。読み込みは通り、`include` などのファイル機能を使ったときは失敗スタブの `accessed readFileSync` で明示的に失敗する (フォールバックは無い。リポジトリの EJS の使い方は文字列テンプレートだけで、ファイルを読まない)。
  2. `resolvePackagesFromPublic` で、Tauri ビルドの `jimp` の import を、パッケージが配布している自己完結のブラウザ用バンドル (`jimp/browser/lib/jimp.js`) に向ける。
  あわせて `patchTauriPackages` は、置換前の文字列が「ちょうど 1 回」見つからなければビルドを失敗させる (従来は 0 回のみ検査していた)。
- 起動テスト (`src/test/app/platform/tauri/tauriBoot.test.js` と `src/test/utils/tauriBootBootstrap.mjs`): テストの中で `vite build --mode tauri` を一時ディレクトリに出力し、実際の分割 ES module (`index.js` と `tauri-game.js`) を、`--experimental-vm-modules` を付けた子 Node プロセス (`fork`) で、jsdom の window コンテキストに `vm.SourceTextModule` でリンクして評価する (`index.js` の動的 import も同じコンテキストで解決する)。このコンテキストには `require` / `process` / `Buffer` / `module` / `global` が無い (テストが確認する)。新規状態 (空の store、セーブなし、拡張機能フォルダなし) で、`#app .__loading` が消えて `.TitleScreen` が現れること、`console.error` と未処理の reject が無いことを検査する。ejs のパッチ前の状態に戻すと、このテストはユーザーが報告した `accessed readFileSync` で失敗する (確認済み)。
- `jimp` をブラウザ用バンドルにした結果、`stream` / `events` / `url` の shim はバンドルに入らなくなった。`tauriBundle.test.js` はそれに合わせ、jimp のバンドル (browserify 形式で、内部の `require("assert")` は自前のモジュール表のキー) を `require` の検査から除き、バンドルされる W2 の実装の一覧から外した。
- 起動テストが本物のもの: ゲームの全コード、React、styled-components、ejs / pug / cheerio、`@tauri-apps/*` のコード、Phaser / ace / firebase (`public/lib` の本物のスクリプトを、`index.html` と同じく `index.js` の前に評価)、`public/` のゲームの内容 (レベル、アイテム、`content/`。リソースディレクトリの中身として読む)。
- 起動テストが代用しているもの (Tauri の IPC の境界 `window.__TAURI_INTERNALS__.invoke` と環境): 起動時に呼ばれる Tauri のコマンド (パス、バージョン、`is_dev`、store、fs。想定外のコマンドは reject し、テストが失敗する)。store は空 (ファイルが無い初回起動)。fs プラグインは、リソースディレクトリ (`public/`) の読み取りだけ本物のファイルで、それ以外 (アプリデータ) は空のメモリ上の領域。音声ディレクトリ (`levels/common/music` と `sfx`) は空の一覧として返す (音声ゲートを通すため。音声ファイルは読み込まない)。IndexedDB は `fake-indexeddb` (jsdom には無く、webview にはある)。canvas の `getContext` は `null` (jsdom の制約)。
- 起動テストが確認しないもの: 本物の WebView (WKWebView / WebView2 / WebKitGTK) での動作、音声の再生と読み込み、キー入力と Phaser の描画 (canvas)、タイトル画面から先 (オンボーディング、レベル)、実際の Tauri プラグインとケーパビリティの scope (IPC をモックしているため、scope 不足は検出できない)、asset プロトコル、CSS とレイアウト。したがって、起動テストが通っても下の手動確認は必要。
- 解消 (#140): ブラウザ用の jimp バンドルは URL かバッファから画像を読むため、`avatarRenderer.js` の入力を `toAssetSrc(staticFilePath(...))` にした (W9 の実施結果を参照)。`ejs` のファイル系機能 (`include` など) は Tauri で使えない (使うときに明示的に失敗する)。
- ユーザーの手動確認 (Tauri):

```sh
npm run build:tauri
npm run tauri -- dev
```

  - タイトル画面 (ロゴと `press spacebar to start`) が表示され、ローディング画面で止まらない。
  - F12 のコンソールに `fs is not available` (`The Node module "fs" is not available`)、`Buffer is not defined`、`process is not defined`、`TerminalQuest failed to start` が出ない (`./local_config` の `Cannot find module` のログは出てよい)。
  - 確認後に `npm run build:all` で Electron の出力を作り直す (`npm run build:tauri` は `public/index.js` を上書きする)。

## 5. 順序と依存

```
W1 (build) ──> W2 (builtins) ──┬──> W5 (URL/path) ──┬──> W8 (pug)
                               │                    ├──> W9 (jimp)
W3 (entry/menu) ───────────────┤                    └──> W10 (menu items, scope)
W4 (store async) ──────────────┤
W7 (platform id) ──────────────┘
W6 (sync fs) ─ (W4 の後) ────────> W11 (実機確認) ──> W12 (配布)
```

- W1、W3、W4、W6 は互いに独立して着手できる。W4 は Electron 上でも完結するので、W1 を待たずに進められる。
- 最初の起動マイルストーン (マイルストーン 1) の必須項目: W1、W2、W3、W4、W5 の (1)〜(3) の音声 URL と (5) の asset プロトコル、W7。
- マイルストーン 2 (fog_owl レベル) の追加項目: W5 の残り、W6、W9。
- それ以降: W8、W10、W11、W12。

### 最初の起動マイルストーンのクリティカルパス

W1 -> W2 (ビルドが `require` なしで完成する) -> W3 (`remote` 除去と描画の競合) -> W4 (`getValue`/`setValue` で落ちない) -> W5 (音声 `listAsync(staticFilePath(...))` と音声 URL が通り、`audioManager.onload` が呼ばれる) -> W7。音声の読み込みが終わらないと App が描画されない (`index.jsx:192-199`) ので、音声の URL 化 (W5) は「タイトル画面が出る」ための必須条件である。

## 6. マイルストーンごとの手動確認 (ユーザーが実行する)

エージェントはアプリを起動しない。以下はユーザーが実行する。

共通 (毎回):

```sh
npm ci
npm test
# Electron 出力のハッシュ確認 (比較の基準は「変更前のリビジョン」で作る):
#   1. 変更前のコミット (base または origin/main) を別の worktree に checkout し、npm ci && npm run build:all を実行して
#      shasum -a 256 public/index.js > /tmp/index.js.before を保存する
#   2. 変更後のリビジョンで同じ条件 (npm run build:all、同じ NODE_ENV) でビルドし直し、下の確認を行う
#   (現在のリビジョンをビルドして基準にしてはいけない。変更後の出力を自分自身と比べることになる)
npm run build:all && git status --short                # 追跡対象の出力に変更が無いこと
shasum -a 256 -c /tmp/index.js.before                  # public/index.js が変更前と同一であること (このファイルは .gitignore 対象で git status に出ない)
# 注意: npm run build:tauri / build:js:tauri / tauri dev も public/index.js を上書きする。Tauri のビルドのあとは、
# 必ず npm run build:all で Electron の出力を作り直してから比較する
npm start                                    # Electron が従来どおり起動し、タイトル画面からゲームが始められる
```

### マイルストーン 0 (W1 + W2: ビルド)

```sh
npm run build:js:tauri
grep -n '^import' public/index.js public/tauri-game.js   # 相対 import (./index.js) のみで、パッケージ名の import / require("パッケージ") が無いこと
ls public/*.js                               # index.js と tauri-game.js
```

### マイルストーン 1 (W1〜W5、W7: タイトル画面)

```sh
npm run tauri -- dev
```

- ウィンドウが 1280x800 で開き、ローディング表示 (fog_owl.gif) からタイトル画面 (TitleScreen) に切り替わる。
- コンソールに `ERR_TAURI_SYNC_UNSUPPORTED`、`require is not defined`、`Permission ... not found`、`Not allowed to load local resource` が出ない。
- 音が鳴る場合は鳴る (鳴らなくてもよい。自動再生の制限の可能性があるので、画面が出たかどうかと分けて報告する)。
- 終了: ウィンドウを閉じると確認ダイアログが出る (#64)。
- 報告してほしい情報: コンソールの最初のエラー、ネットワークタブで 404 になった URL (`tauri://localhost/...`、`asset://...`)。

### マイルストーン 2 (W6、W9 追加: fog_owl レベル)

```sh
npm run tauri -- dev
```

- タイトル画面から新規開始し、オンボーディング (名前、アバター) を進めて、fog_owl のマップが表示される。キー操作でプレイヤーが動く。
- アバター画像が表示される。
- コンソールにレベル読み込み (`Game.jsx`) のエラーが出ない。

### マイルストーン 3 (W8、W10、W11: ゲームプレイ)

```sh
npm run tauri -- dev
```

- NPC に話しかけて会話が表示される。
- ミッションの目標を開き、validator が実行され (`python3` / `node` / `git` を使う目標を含む)、結果が表示される。QuestIDE でコードを保存・再読み込みできる。
- 設定の拡張機能タブでディレクトリを選んで反映される。アプリを再起動しても読めること (W10 の scope の永続化)。
- Help メニューの各項目 (W10 の判断どおり)。
- データ消去 (Erase Game Data) が動き、再読み込み後に初期状態になる。

### マイルストーン 4 (W12: 配布ビルド)

```sh
npm run tauri -- build --debug
```

- `tauri-resources.md` 4 章の手順で `Resources/` の中身を確認し、生成物の起動でマイルストーン 1〜3 を再確認する。

## 7. リスク

- R1: `vite build --mode tauri` の出力は今回確認していない。W1 の着手時にまず現在の出力を生成し、`require(` が残る箇所を一覧にする (本書の B1〜B2 の根拠は設定ファイルとテストの内容)。
- R2: asset プロトコルの scope と、dialog で選んだ拡張機能ディレクトリの関係 (W5、W10)。実機でしか確認できない。
- R3: WKWebView の自動再生制限により、タイトル画面の音楽が鳴らない可能性 (起動の可否とは別問題として扱う)。
- R4: `jimp` のブラウザ動作 (W9): jsdom (Node のグローバル無し) での合成は Electron と全画素一致を確認済み (#140)。実際の webview での確認は未実施。`cheerio` / `pug` は W8 で解消 (#139)。bundle には通っても実行時に失敗する場合の代替 (Canvas、`DOMParser`) は挙動変更を伴うため、事前に相談が必要。
- R5: W3、W4、W5 は Electron と共有するコードを触る。`index.jsx`、`audio/index.js`、`ContextProvider.jsx`、`fs_utils.js` は動作確認済みなので、挙動を固定するテストを先に足してから変更する。
- R6: Windows のパス意味論 (`path.sep`、ドライブレター、`$CONFIG` scope の大文字小文字) は W12 まで未検証。
- R7: Tauri の store と Electron の `userData/config.json` は別ファイルで、既存のセーブデータは引き継がれない (`tauri-platform.md` 1.4 章)。#63 / #65 の前に移行の要否を決める。
