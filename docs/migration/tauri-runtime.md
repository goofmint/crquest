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
| `remove(path)` | `ClearDataButton.jsx:56` | データ消去 (S2) |
| `list(path)` | `Game.jsx:228` (`for (const entityKey of list(commonEntitiesDir))`、周囲は既に `async`) | レベル読み込み = fog_owl 到達 (S2、マイルストーン 2) |
| `readFileSync('/proc/cpuinfo')` | `context_provider/system.js:25` (try/catch 内) | 例外は握られて `isPi()` が `false` になる。起動は止まらないが、Tauri の fs scope に `/proc` は無いため Linux では常に `false` (S2、挙動の確認事項) |
| `pathExistsSync` | `ValidationHelper.js:173` (`isExecutableValid` は既に `async`: `ValidationHelper.js:156`) | 実行ファイルパス検証 (S2) |

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
- Tauri 実装 `platform/tauri/menu.js`: D2 の決定どおり、何もしない関数である (コメントで明示)。JS からアプリケーションメニューを置き換えると、`close.rs` が作る macOS のメニュー (Cmd+Q の終了確認) を壊すため、W10 まで追加しない。DevTools は `tauriShell.js` のショートカットで使える。
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

### W5. 静的パスと URL の集約 (B3、D5)

- 内容: (1) `fs_utils.js` の `staticFilePath` を Tauri では `getResourceDirPath()` を基準にする。Electron 実装は現状のまま。(2) 「絶対パス -> URL」の関数 (例: `platform/assets.js`、`toAssetUrl(absolutePath)`) を新設し、Electron 実装は `file-url`、Tauri 実装は D5 に従う。(3) 呼び出し元を置き換える: `Conversation.jsx:271`、`SpriteSheet.jsx:16`、`useAssetLoader.jsx:22,31,52`、`fs_utils.js:27`、`EntityConfigService.js:271,273`、`Game.jsx:166-212`、`DynamicLevel.js:66-81`、`audio/index.js:171,202,236`、`AvatarSelector.jsx:60`。(4) Worker の URL (`code_runner.js:11`、`ValidationHelper.js:265,348`) は Tauri では相対 URL にする。(5) asset プロトコル (`src-tauri/Cargo.toml` の `protocol-asset`、`tauri.conf.json` の `app.security.assetProtocol`、capability)。
- 規模: 約 18 ファイル。大きければ「(1)(2)(3)(4) の JS」と「(5) の Rust・設定」に 2 PR へ分ける。
- 依存: W2 (`path`)。(5) は独立。
- Electron リスク: 中。呼び出し元を共通関数に置き換えるため。Electron 実装は現在の出力と同一の文字列を返すことをテストで固定する (`fs_utils.test.js`、`useAssetLoader` など)。
- 要確認: ダイアログで選んだディレクトリが asset プロトコルの scope にも自動で追加されるか (`tauri-plugin-dialog` の挙動)。追加されない場合は W9 で scope を足す。

### W6. 同期 fs / exec の置き換え (B4)

- 内容: `Game.jsx:228` の `list` を `listAsync` に、`ClearDataButton.jsx:56` の `remove` を `removeAsync` に、`ValidationHelper.js:173` の `pathExistsSync` を `existsAsync` に、`system.js:25` の `readFileSync` を非同期の読み取りに替える (`isPi` と `initializeSystemInfo` を `async` に)。Tauri では `/proc/cpuinfo` が fs scope 外なので、Linux 判定の扱いを決める (D6: Raspberry Pi 判定を Tauri では行わないと記録する、または scope を足す)。
- 規模: 約 6 ファイル + テスト。
- 依存: なし。W4 と同じファイル (`ClearDataButton.jsx`) を触るので、W4 のあとに行うか同じ PR にまとめる。
- Electron リスク: 低 (置き換え先は Electron にも既存の非同期 API。`sync-api.md` の対象)。`Game.jsx` は `Promise.all` の順序とログ順を維持する。

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

### W9. アバター (jimp) の Tauri 対応 (B7)

- 内容: `avatarRenderer.js:44-65` の `Jimp.read(staticFilePath(...))` を URL 入力にする (W5 の関数を使う)。ブラウザ向けの `jimp` が bundle できることの確認。動かなければ Canvas で合成する案を別途検討する (挙動変更になるため要相談)。
- 規模: 約 3 ファイル。
- 依存: W5。
- Electron リスク: 低〜中 (Electron では従来のファイルパスの入力のまま)。

### W10. メニュー項目と拡張機能ディレクトリ (B5、B8)

- 内容: (1) Help メニューの "Sync Bundled Assets" / "Open User Data" / "Open Save File" を Tauri の menu API で実装する (D2)。(2) ダイアログで選んだ拡張機能ディレクトリの scope (fs と asset プロトコル) を再起動後も保つ (`tauri-plugin-persisted-scope` の導入、または選択パスの保存と起動時の再許可)。
- 規模: 約 8 ファイル (Rust、capability、`platform/tauri/menu.js`、テスト)。
- 依存: W3、W5。
- Electron リスク: なし (Tauri のみ)。

### W11. コード実行・検証の実機確認と修正 (B3 の Worker、B8)

- 内容: `QuestIDE` の保存 (`$CONFIG/TerminalQuest/QuestIDE`)、`code_runner/worker.js` の Worker 起動 (`tauri://` オリジン)、`helper.exec` の許可リスト (`python3`、`git`、`node`)、`ValidationHelper` の fs 契約を実機で確認し、必要な修正をする。
- 規模: 不明 (確認の結果次第。見込み 3〜6 ファイル)。
- 依存: W5、W6。
- Electron リスク: なし (Tauri 側の修正のみ。共通コードを触るときは別 PR)。

### W12. 配布ビルド (後続、#63 の周辺)

- 内容: `frontendDist` から `content/`、`levels/` の重複を除く (`tauri-resources.md` 5 章)、`public/node_modules` の埋め込みを絞る、CSP (`csp: null` の見直し)、Windows のパス意味論 (D4 の (b))、`tauri build` の確認、Electron からの保存データ移行の要否。
- 規模: 約 6〜10 ファイル。
- 依存: W1〜W11。
- Electron リスク: なし。

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
- R4: `jimp` / `cheerio` / `pug` のブラウザ動作 (W8、W9)。bundle には通っても実行時に失敗する場合の代替 (Canvas、`DOMParser`) は挙動変更を伴うため、事前に相談が必要。
- R5: W3、W4、W5 は Electron と共有するコードを触る。`index.jsx`、`audio/index.js`、`ContextProvider.jsx`、`fs_utils.js` は動作確認済みなので、挙動を固定するテストを先に足してから変更する。
- R6: Windows のパス意味論 (`path.sep`、ドライブレター、`$CONFIG` scope の大文字小文字) は W12 まで未検証。
- R7: Tauri の store と Electron の `userData/config.json` は別ファイルで、既存のセーブデータは引き継がれない (`tauri-platform.md` 1.4 章)。#63 / #65 の前に移行の要否を決める。
