# Tauri の platform 層 (#59 / #60 / #61)

`src-tauri/` (#58, `tauri-scaffold.md`) に plugin、権限、command、`platform/*` の Tauri 実装を足した記録である。Electron は変更していない (`npm start` の挙動は従来どおり)。

## 1. プラグインと権限 (#59)

### 1.1 導入したもの

| plugin | Rust crate (Cargo.lock) | JS パッケージ (ルート `package.json`) | 用途 (platform モジュール) |
| --- | --- | --- | --- |
| fs | `tauri-plugin-fs` 2.7.1 | `@tauri-apps/plugin-fs` ^2.7.1 | `platform/fs` |
| dialog | `tauri-plugin-dialog` 2.8.4 | `@tauri-apps/plugin-dialog` ^2.8.4 | `platform/dialog` |
| store | `tauri-plugin-store` 2.5.1 | `@tauri-apps/plugin-store` ^2.5.1 | `platform/store` |
| opener | `tauri-plugin-opener` 2.7.3 | `@tauri-apps/plugin-opener` ^2.7.3 | `platform/shell` |
| os | `tauri-plugin-os` 2.4.0 | `@tauri-apps/plugin-os` ^2.4.0 | 現時点で呼び出し元なし (後続で `process.platform` の置換に使う) |

`src-tauri/src/lib.rs` で 5 つとも `.plugin(...)` で登録している。権限は `src-tauri/capabilities/platform.json` (ウィンドウ `main`) にあり、`core:default` は従来どおり `default.json` にある。

### 1.2 方針

- `fs:default` や `dialog:default` などの `*:default` セットは使わない。コード上の利用実績がある個別 permission だけを列挙する。
- fs はコマンドごとに scope を付け、`**` 単独やホーム全体は許可しない。
- 読み取りと書き込みで scope を分ける。書き込み可能な場所はユーザーデータのみ。
- scope は Electron の実際の配置に合わせる。Electron の `appData` は OS 共通の設定ディレクトリであり、Tauri の `$CONFIG` (macOS `~/Library/Application Support`、Windows `%APPDATA%`、Linux `~/.config`) と一致する。
  - `userData` = `appData/terminalquest` (Electron のアプリ名は `package.json` の `name`。`main.js` は `setName` しない)。
  - `config.js` の `appDataPath` = `appData/TerminalQuest` (QuestIDE のコード保存先 `QuestIDE` を含む)。大文字小文字が異なるため、大文字小文字を区別する Linux でも届くよう両方を許可する。

### 1.3 permission 一覧

scope の変数: `READ` = `$RESOURCE`、`$RESOURCE/**`、`$CONFIG/terminalquest(/**)`、`$CONFIG/TerminalQuest(/**)`。`WRITE` = `$CONFIG/terminalquest(/**)`、`$CONFIG/TerminalQuest(/**)` (リソースを含まない)。

| permission | scope | 理由 |
| --- | --- | --- |
| `fs:allow-read-text-file` | READ + `/proc/cpuinfo` (単一ファイル、読み取りのみ) | Raspberry Pi 判定 (`context_provider/system.js` の `readFile('/proc/cpuinfo')`)。`/proc/**` は許可しない |
| `fs:allow-read-text-file` / `read-file` / `read-dir` / `exists` / `stat` / `lstat` | READ | `platform/fs` の `readFile` `readdir` `stat` `lstat` `existsAsync` `listAsync` `readAsync`。同梱コンテンツ (リソース) とユーザーデータの読み取り |
| `fs:allow-write-text-file` / `write-file` / `mkdir` | WRITE | `writeAsync` (親ディレクトリ作成を含む)。QuestIDE のコード保存、validator の `error.txt` |
| `fs:allow-copy-file` / `remove` | WRITE | `copyAsync` / `removeAsync` / `ClearDataButton` の `remove` (セーブデータ削除) |
| `dialog:allow-open` | なし (コマンド単位) | 拡張ディレクトリ選択 (`showDirectoryDialog`) |
| `dialog:allow-message` | なし | 確認 / 警告ダイアログ (`showConfirm` / `showAlert`)。plugin の `confirm` / `message` はこのコマンドを使う |
| `store:allow-load` / `get` / `set` / `has` / `delete` / `save` / `reload` | なし (store は resource id 経由で、パス scope を持たない) | `platform/store`。`reload` は読み込み失敗の検出に使う (3.3 章)。`clear` / `reset` / `entries` / `keys` / `values` / `length` / `get_store` は使わないので付けない |
| `opener:allow-open-url` | `https://*`、`http://*` | 外部リンク (`openExternal`)。`file:` や独自スキームは許可しない |
| `opener:allow-open-path` | WRITE と同じ 2 つのディレクトリ、`$APPDATA` (ディレクトリそのもの)、`$APPDATA/config.json` (store ファイル。`/**` なし) | メニュー "Open User Data" / "Open Save File" (`platform/tauri/menu.js`、#141) |
| `allow-enable-help-menu` | なし (引数なし) | Help メニュー項目の有効化 (`help_menu.rs`、#141) |
| `os:allow-platform` | なし | 他の os 権限 (arch, version, locale, hostname など) は付けない |
| `core:default` | (`default.json`) | #58 のまま |

付けていないもの: `fs:allow-open` / `create` / `rename` / `truncate` / `watch` / `read-text-file-lines`、`opener:allow-reveal-item-in-dir`、`dialog:allow-save`、`shell` plugin (コマンド実行は #61 の専用 Rust command で行う)。

### 1.4 既知の制約

- ダイアログで選んだディレクトリは、plugin-dialog が実行時に fs の scope (`recursive: true`) と asset プロトコルの scope (再帰) の両方へ追加する。fs の scope は、このウィンドウに許可された fs コマンド全部 (書き込み系を含む) に効く。#141 で `tauri-plugin-persisted-scope` (feature `protocol-asset`、`tauri_plugin_fs::init()` の後に登録) を入れたので、この 2 つは再起動後に復元される。
  - 永続化されるもの: fs の動的 scope と asset の scope の許可・禁止パターン全体。保存先は `$APPDATA/<identifier>` の `.persisted-scope` (fs) と `.persisted-scope-asset` (asset)。asset の scope は `tauri.conf.json` の静的な scope (`$RESOURCE/**` など) も含むので、それらも解決済みの絶対パスで保存される (インストール先が変わると古いパスが残るが、そのパスの下にしか効かない)。capability の scope (`platform.json`) は別物で、保存されない。`**` やホーム全体の許可は追加していない (許可されるのはユーザーが選んだディレクトリだけ)。
  - リスク: (1) 選んだディレクトリは、取り消す API が無いので、アプリの設定を変えても許可が残る (消すには `.persisted-scope*` を削除する)。(2) 書き込み系の fs コマンドにも効くので、選んだディレクトリは再起動後も書き込み可能である。(3) plugin は保存・復元の失敗を通知しない (壊れたファイルは空として読み、復元できなかったパスは黙って許可されない。再選択で直る)。(4) 状態ファイルは `$APPDATA` にあり、renderer は store plugin で `$APPDATA` 配下の store を load / save できる (plugin は状態ファイル自身を fs の scope から禁止しているが、store 経由の到達は防げない。内容は bincode なので、JSON の store で偽造しにくいという程度の根拠である)。
  - 設定画面の `extensions.directory` (パス) は従来どおり store に保存される。パスの保存は権限の復元ではなく、権限の復元はこの plugin が行う。
- `$RESOURCE` はバンドルに `bundle.resources` で入れたファイルの置き場である。現在の `tauri.conf.json` は `frontendDist` を埋め込むだけで、`public/content` 等をリソースにしていない (配布構成は未決定。`tauri-scaffold.md` 参照)。そのため `$RESOURCE` の読み取り許可は、配布構成が決まるまで実質何も指さない。
- store の保存先は plugin 既定の `$APPDATA/<identifier>` 配下で、Electron の `userData/config.json` とは別である。Electron からの移行は範囲外。

## 2. コマンド実行 (#61)

`src-tauri/src/exec.rs` (Tauri 非依存の純ロジック + 単体テスト) と `src-tauri/src/lib.rs` (Tauri command) である。`shell` plugin は使わない。

### 2.1 command

| command | 引数 (JS 側は camelCase) | 結果 |
| --- | --- | --- |
| `run_command` | `program`, `args`, `cwd?`, `env?`, `timeoutMs?`, `maxBuffer?` | 成功: `{ code, stdout, stderr }`。終了コードが非ゼロでも成功扱い (`platform/exec.js` の `run` と同じ) |
| `command_exists` | `name` | `true` / `false` |

失敗 (invoke の reject 値) は `{ kind, code, message, stdout, stderr, killed }` である。`kind` は次のいずれか。

| kind | 発生条件 | Node との対応 |
| --- | --- | --- |
| `notAllowed` | 許可リスト外 | (Node には無い) |
| `invalidArgument` | 空文字、相対パス、NUL を含む名前 | `commandExists` の空文字拒否に相当 |
| `spawn` | 起動失敗。`code` は `ENOENT` / `EACCES` / `UNKNOWN`。存在しない `cwd` も `ENOENT` | `spawn ENOENT` など |
| `timeout` | `timeoutMs` 経過。プロセスを kill。`killed: true`、それまでの出力を保持 | `error.killed` |
| `maxBuffer` | stdout か stderr が `maxBuffer` バイトを超過 (既定 1 MiB = Node 12 の既定)。kill する | `maxBuffer` 超過 |
| `signal` | シグナルで終了 | `code` が数値でない reject |

- シェルは使わない (`std::process::Command`)。引数は 1 つずつ渡るので、クォートやインジェクションの問題が無い。
- `env` を渡すと環境全体を置き換える (Node の `env` オプションと同じ)。
- 標準入力は閉じる (`/dev/null`)。
- 出力はパイプではなく一時ファイル (権限 0600、終了時に削除) に書かせる。読み取りスレッドが無いので、孫プロセスが出力を握ったままでも、タイムアウトや `maxBuffer` 超過で確実に戻る。サイズは 10 ms ごとに確認する (超過分の書き込みが少し進むことがある)。失敗時に返す出力は `maxBuffer` バイトまでに切る。
- Node の `timeout` は SIGTERM、こちらは強制終了 (Unix は SIGKILL) である。SIGTERM を握りつぶす子プロセスも止まる。Unix では子をプロセスグループのリーダーとして起動し、グループごと kill する (孫が書き続けない)。Windows は子プロセスだけを kill する。
- 出力は UTF-8 として解釈する (不正なバイトは U+FFFD)。
- `command_exists` は Rust 側の PATH 探索 (実行可能なファイルがあるか。Windows は `PATHEXT` を試す) で、`/bin/sh -c 'command -v'` / `where` は呼ばない。シェルの組み込みコマンドやエイリアスは見つけない。

### 2.2 セキュリティモデル (許可リスト)

validator は任意の拡張パッケージから来るため、webview から呼べる command は「何でも実行できる」口にしてはいけない。許可は 2 層ある。

1. 権限: command は `build.rs` の app manifest に登録してあり、`allow-run-command` / `allow-command-exists` を持つ capability のウィンドウ (`main`) だけが呼べる。
2. スコープ: 許可するプログラム名のパターンは `src-tauri/capabilities/platform.json` の `{ "program": "..." }` で宣言し、Rust は `CommandScope` から読む (Rust にリストを埋め込んでいない)。スコープが空なら全拒否する。

現在の許可パターン: `git`、`node`、`npm`、`python`、`python3`、`python3.*` (`*` は任意の文字列)。

照合の規則は次のとおり。

- 照合対象は、ディレクトリ部と末尾の `.exe` を除いたファイル名 (大文字小文字は区別しない)。`.cmd` / `.bat` は除かない (= 拒否される。cmd.exe が引数を再解釈する問題 (BatBadBut 系) を避けるため)。このため Windows の `npm.cmd` は実行できない。代替は `node` で npm の CLI スクリプト (`npm-cli.js`) を直接実行することで、実装はしていない。
- ディレクトリ部のある `program` は絶対パスのみ。`./git` や `bin/git` は拒否する。
- ディレクトリ部の無い名前は OS の PATH 解決に任せる。
- したがって、学習者が設定で指定する実行ファイルのパス (`TQ_PYTHON_EXE`、`TQ_GIT_EXE`、`isExecutableValid` で検証する node など。いずれも `public/content` の validator が `helper.exec(path, args)` に渡す) は、ファイル名が上のパターンに合えば動く (例: `/opt/homebrew/bin/python3.11`、`C:\Program Files\Git\cmd\git.exe`)。`py.exe`、`python-3.12` や `pypy`、`pwsh` など、別名の実行ファイルは拒否される。拒否されて困る場合はパターンを capability に追加する。
- `command_exists` は、許可パターンに合う「名前だけ」を受け付ける (パスは `invalidArgument`)。現在の呼び出し元は `commandExists('git')` のみ。Electron は任意の名前を調べられたが、Tauri では許可名に限る (他の名前を調べる道具にしないため)。

引数と `cwd` は検査しない。`python -c` や `node -e` は、ゲームがユーザーコードを検証するために引数で任意コードを実行するので、これを塞ぐとゲームが成立しない。この許可リストが防ぐのは「webview から任意の別プログラム (`sh`、`curl`、`rm` など) を起動すること」であり、許可した 5 種のインタプリタ経由の任意コード実行は防がない。残る危険と前提は次のとおり。

- webview に任意の JS が入る状況 (拡張コンテンツの validator は元々ここで動く) では、許可した `node` / `python` 経由で任意コードを実行できる。これは Electron (`nodeIntegration`) の現状より悪化していない。
- 許可パターンに合う名前の実行ファイルをユーザーが指定すれば何でも動く。名前の照合は信頼の根拠ではなく、起動できるプログラムの種類を絞る仕組みである。
- スコープが capability から Rust へ渡らない場合 (設定ミス) は、全拒否に倒れる (起動できなくなるだけで、許可が広がることはない)。

### 2.3 シェル文字列の `exec` (`isExecutableValid`)

`platform/exec.js` の `exec(command, options)` は、シェルを介して文字列を実行する。呼び出し元は `ValidationHelper.isExecutableValid` だけで、`"${path}" ${args.join(' ')}` を渡し、エラーメッセージの文字列 (`EPERM`、`access denied`) を見て分岐する。

判断: Tauri にはシェル経由の経路を作らない。Rust 側に `exec` 用の command は無い。#60 の Tauri 実装 `exec` は、この形 (`"<絶対パス>" <空白区切りの引数>`) だけを厳密に解析して `run_command` に委譲する (次章)。クォートやシェルのメタ文字を含む引数、先頭が `"` で始まらない文字列は、実行せず明示的なエラーにする。

### 2.4 テスト

`cd src-tauri && cargo test`: 許可リスト (許可、拒否、相対パス、空スコープ)、`command_exists`、実プロセスでの終了コード、出力、非ゼロ終了、ENOENT / EACCES、`cwd`、`env`、タイムアウト、`maxBuffer`、シグナル、引数がシェルに解釈されないこと (Unix のみ `/bin/sh` と `/bin/echo` を使うテスト)。

## 3. `platform/*` の Tauri 実装 (#60)

### 3.1 ファイルと選択方式

| Electron (従来) | Tauri 実装 |
| --- | --- |
| `src/js/app/platform/{paths,dialog,store,fs,shell,exec,devtools,menu,env}.js` | `src/js/app/platform/tauri/<同名>.js` |
| `src/js/app/platform/init.js` (新規。何もしない `initPlatform()`) | `src/js/app/platform/tauri/init.js` |
| (なし) | `tauri/errors.js` (エラー変換)、`tauri/state.js` (`initPlatform` が読んだ値) |

公開する関数名は Electron と同じである (`src/test/app/platform/tauri/selection.test.js` が名前の一致を検査する)。例外は `tauri/store.js` が持つ追加の `getValueAsync` / `setValueAsync` / `hasValueAsync` / `deleteValueAsync` である。

選択はビルド時に行う。`vite.config.mjs` に Vite プラグイン `terminalquest:select-platform` を足した。

- `vite build` (`npm run build:js` / `build:all` / `npm start`): 従来どおり Electron 実装。プラグインは何もせず、出力 `public/index.js` は変更前とバイト単位で同一であることを確認済み。
- `vite build --mode tauri` (`npm run build:js:tauri`): `platform/<名前>` への相対 import を `platform/tauri/<名前>` に差し替え、`@tauri-apps/*` を external にせず bundle する。
- `build:all` には接続していない (`tauri.conf.json` の before コマンドは #64 から `build:tauri` で、`build:js:tauri` を使う)。Electron 専用の `require` を使う他のコードが残っており (Phase 11)、Tauri 向け bundle 全体はまだ動かないため。`build:js:tauri` は `public/index.js` を上書きする点に注意 (出力先を変えたいときは `npx vite build --mode tauri --outDir <dir>`)。

### 3.2 同期 API の扱い (一覧)

Tauri の plugin はすべて非同期である。Electron 契約で同期のメンバーは次のとおり。呼び出し元の非同期化は範囲外とし、Tauri 実装は明示的に失敗する (既定値や代替動作は無い)。

| メンバー | Tauri での扱い | 現在の呼び出し元 (対応が必要な箇所) |
| --- | --- | --- |
| `paths.getAppDataPath` / `getUserDataPath` / `getAppVersion` | 同期のまま。`await initPlatform()` が値を読み、以降は同期で返す。未初期化は throw | `config.js` (モジュール読み込み時に呼ぶ)、`analytics.js`。エントリで `initPlatform()` を待ってからアプリを読み込む必要がある |
| `env.isDev` | 同上 (Rust の `is_dev`) | `config.js`、`assetLoader.js`、`firebase.js`、`gameEvents.js`、`itemsHelper.js`、`index.jsx` |
| `store.getValue` / `setValue` / `hasValue` / `deleteValue` | throw (`ERR_TAURI_SYNC_UNSUPPORTED`)。非同期版 `*Async` を追加 | `ContextProvider.jsx` (getValue)、`common/context/index.js` (setValue)、`common/audio/index.js` (getValue / setValue)、`ClearDataButton.jsx` (hasValue / deleteValue) |
| `fs.exists` / `list` / `read` / `remove` / `readFileSync`、`exec.pathExistsSync` | 契約から削除した (W6 #137)。Electron と Tauri の両方に存在しない。非同期の `existsAsync` / `listAsync` / `readAsync` / `removeAsync` / `readFile` を使う | なし |
| `exec.pathExists(path)` (非同期、追加) | Electron: `fs.existsSync` の結果 (Windows Store の `fs.stat` 問題を避ける)。Tauri: `existsAsync` (stat)。ENOENT 以外の失敗 (scope 外のパスなど) は reject する | `ValidationHelper.isExecutableValid`。ユーザー指定の実行ファイルのパスは fs の read scope の外なので Tauri では reject になる (W11)。Windows Store アプリの `stat` は未検証 |
| `devtools.openDevTools` / `toggleDevTools` | `Promise<void>` を返す (#64、`tauri-shell.md`)。Rust コマンドを呼び、失敗 (release ビルド) は reject する。await しない呼び出し元は未処理の Promise 拒否になる。「フォーカス中のウィンドウが無い」例外は出せない | `index.jsx`、`App.jsx` |

`exec.exec` (シェル文字列) の扱いは 2.3 章のとおり。

### 3.3 モジュールごとの差異

- `paths`: `getAppDataPath` は `configDir()` (Electron の `appData` と同じ場所)。`getUserDataPath` は `<appData>/terminalquest` (Electron の `userData` と同じ。既存のセーブファイルの位置を保つための互換値)。`getAppVersion` と `getGamePackageVersion` は `getVersion()` を返す。`tauri.conf.json` の `version` が `public/package.json` を指すため、後者の定義と一致する。ファイルは読まない。開発時に Electron のバージョンが返る (Electron の `getAppVersion`) ことは再現しない。
- `dialog`: 確認ダイアログは `kind: 'info'` (Tauri に question 種別が無い)。`buttonLabel` は無視する。ディレクトリ選択は plugin が fs の実行時 scope に追加する (`recursive: true`)。キャンセルは `undefined`。
- `store`: `config.json` を plugin の保存先 (`$APPDATA/<identifier>`) に作る。plugin の `load()` は読み込み中のエラー (壊れた JSON、権限) をすべて無視して空のストアを返し、次の `save` で上書きしてしまう。そのため `load()` の直後に `reload({ ignoreDefaults: true })` で読み直し、ファイルが無い場合 (初回) だけを許容し、それ以外は reject する (開いたストアは `close()` し、失敗は保持しない)。Electron の `userData/config.json` からの移行はしない。書き込みのたびに `save()` する。
- `fs`: plugin のエラー文字列を `Error` に変換し、存在しないパスは `code: 'ENOENT'` を付ける (他の Node エラーコードは再現しない)。`readFile` (エンコーディング無し) は `Buffer` ではなく `Uint8Array`。UTF-8 以外のエンコーディングは明示的に失敗する。`stat` / `lstat` は `isFile` / `isDirectory` / `isSymbolicLink` / `size` / `mtime` / `mtimeMs` だけを持つ。`listAsync` はパス必須。`copyAsync` は上書き無しで既存の対象 (ファイルもディレクトリも) があれば `EEXIST`。コピー先がコピー元自身またはその内側なら、何も作らずに reject する (パスは字句的に比較し、大文字小文字は区別しない)。`existsAsync` / `listAsync` / `readAsync` / `removeAsync` は `ENOENT` だけを「存在しない」と扱い、他のエラーは伝播する。
- `shell`: `openExternal` は http(s) のみ、`openPath` はユーザーデータ配下のみ (capability scope)。
- `exec`: `run` / `commandExists` は 2 章の command を呼ぶ。失敗時の `Error` は `code` / `killed` / `signal` / `stdout` / `stderr` / `kind` を持つ。シェル文字列の `exec` は `"<パス>" <引数>` の形だけを解釈する。引数に使える文字は `A-Z a-z 0-9 _ @ % + = : , . / -` のみで、それ以外 (クォート、空白、`;` `|` `$` など) と、先頭が `"` でない文字列は、何も実行せずに拒否する。
- `devtools`: Rust コマンドは呼び出し元のウィンドウに作用する (アプリは 1 ウィンドウ)。debug ビルドのみ。release ビルドでは `devtools` feature を有効にしていない (macOS で非公開 API を使うため) ので拒否する。
- `env`: `is_dev` は Rust の `cfg!(debug_assertions)`。

### 3.4 追加の Rust command と権限

`is_dev`、`open_devtools`、`toggle_devtools` (`src-tauri/src/lib.rs`)。`build.rs` の app manifest に登録し、`platform.json` の `allow-is-dev` / `allow-open-devtools` / `allow-toggle-devtools` で `main` ウィンドウに許可した。

### 3.5 テスト

`npm test`: `src/test/app/platform/tauri/` (Tauri JS API は `vi.mock` と `@tauri-apps/api/mocks` の `mockIPC` で差し替え)。各モジュールの契約、同期メンバーの throw、公開名の一致、Vite の選択 (Electron ビルドは Electron 実装、`--mode tauri` は Tauri 実装を bundle) を検査する。

### 3.6 assets (#136)

`platform/assets.js` / `platform/tauri/assets.js`: 静的パスと URL の構築 (`getStaticRootPath`、`getStaticFileUrl`、`toAssetUrl`、`toAssetSrc`)。詳細は `tauri-runtime.md` の W5。

### 3.7 conversationTemplate (#139)

`platform/conversationTemplate.js` / `platform/tauri/conversationTemplate.js`: 会話の pug テンプレートの描画 (`renderConversationTemplate(absolutePath, context)`)。詳細は `tauri-runtime.md` の W8。

## 4. 未解決事項

- 呼び出し元の非同期化 (3.2 章の表)。`initPlatform()` を呼ぶエントリは未作成 (Phase 11)。
- 同梱ファイル (`public/content` など) の読み取り。Tauri は `frontendDist` を埋め込むだけで、`fs` から読めるリソースにはしていない。`staticFilePath` も `file:` URL 前提である。
- ダイアログで選んだディレクトリの scope は persisted-scope で復元される (1.4 章)。再起動後の実機確認は未実施 (`tauri-runtime.md` の W10)。
- 許可プログラムの scope が実際に Rust へ届くことは、実機で確認していない (下記の手順 5)。

## 5. 手元で確認すること (利用者が実行する)

エージェントは GUI もアプリも起動していない。確認したのは `cargo check` / `clippy` / `test`、`npm ci`、`npm run build:all`、`npm test` と、`vite build --mode tauri` の出力の中身まで。

```sh
npm ci
cd src-tauri && cargo test && cargo clippy --all-targets && cd ..
npm run build:all && git status --short   # Electron のビルド結果 (public/index.js) は変更前と同一
npm test
```

1. Electron の確認: `npm start` が従来どおり動く (platform 層のコードは Electron 側を使い続ける)。
2. Tauri の起動: `npm run tauri -- dev`。起動時に capability や plugin 設定のエラー (`Permission ... not found`、scope の解釈エラー) が出ないこと。フロントはまだ Electron 専用なので、空白画面は想定内 (#58 と同じ)。
3. 開発者ツール (WebView を右クリックの Inspect、または `Cmd+Option+I`) のコンソールで、次を実行する。`window.__TAURI__` は `tauri.conf.json` の `withGlobalTauri` が無効のため使えない。代わりに `window.__TAURI_INTERNALS__.invoke` を使う。
   - 許可された実行: `await __TAURI_INTERNALS__.invoke('run_command', { program: 'git', args: ['--version'] })` が `{ code: 0, stdout: 'git version ...', stderr: '' }` を返す。
   - 拒否: `await __TAURI_INTERNALS__.invoke('run_command', { program: 'ls', args: [] })` が `kind: 'notAllowed'` で reject される。`program: '/bin/sh'`、`'./git'` も同様に拒否される (後者は `invalidArgument`)。
   - 存在しない: `program: 'python3.99'` は許可パターンに合うので `kind: 'spawn'`、`code: 'ENOENT'`。
   - 存在確認: `invoke('command_exists', { name: 'git' })` が `true`。`name: 'ls'` は `notAllowed`。
   - タイムアウト: `invoke('run_command', { program: 'node', args: ['-e', 'setTimeout(()=>{}, 5000)'], timeoutMs: 300 })` が `kind: 'timeout'`。
   - macOS / Linux の GUI アプリは PATH が短いことがあり (Homebrew の `/opt/homebrew/bin` が無いなど)、PATH 解決の `git` / `node` が `ENOENT` になることがある。その場合は絶対パスを渡して動くことを確認し、結果を報告する。
4. 権限: `invoke('plugin:fs|read_text_file', { path: '/etc/hosts' })` が forbidden path で拒否される。`invoke('plugin:opener|open_url', { url: 'file:///etc/hosts' })` も拒否される。
5. 権限の scope が Rust に届いていること: 手順 3 の `git --version` が成功し、`ls` が `notAllowed` で拒否されれば届いている (届いていなければ、全拒否になるので `git` も `notAllowed` になる)。
6. devtools: `invoke('is_dev')` が debug ビルドで `true`。
