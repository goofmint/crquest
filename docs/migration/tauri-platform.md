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
| `fs:allow-read-text-file` / `read-file` / `read-dir` / `exists` / `stat` / `lstat` | READ | `platform/fs` の `readFile` `readdir` `stat` `lstat` `existsAsync` `listAsync` `readAsync`。同梱コンテンツ (リソース) とユーザーデータの読み取り |
| `fs:allow-write-text-file` / `write-file` / `mkdir` | WRITE | `writeAsync` (親ディレクトリ作成を含む)。QuestIDE のコード保存、validator の `error.txt` |
| `fs:allow-copy-file` / `remove` | WRITE | `copyAsync` / `removeAsync` / `ClearDataButton` の `remove` (セーブデータ削除) |
| `dialog:allow-open` | なし (コマンド単位) | 拡張ディレクトリ選択 (`showDirectoryDialog`) |
| `dialog:allow-message` | なし | 確認 / 警告ダイアログ (`showConfirm` / `showAlert`)。plugin の `confirm` / `message` はこのコマンドを使う |
| `store:allow-load` / `get` / `set` / `has` / `delete` / `save` | なし (store は resource id 経由で、パス scope を持たない) | `platform/store`。`clear` / `reset` / `entries` / `keys` / `values` / `length` / `reload` / `get_store` は使わないので付けない |
| `opener:allow-open-url` | `https://*`、`http://*` | 外部リンク (`openExternal`)。`file:` や独自スキームは許可しない |
| `opener:allow-open-path` | WRITE と同じ 2 つのディレクトリ | メニュー "Open User Data" / "Open Save File" (`openPath`) |
| `os:allow-platform` | なし | 他の os 権限 (arch, version, locale, hostname など) は付けない |
| `core:default` | (`default.json`) | #58 のまま |

付けていないもの: `fs:allow-open` / `create` / `rename` / `truncate` / `watch` / `read-text-file-lines`、`opener:allow-reveal-item-in-dir`、`dialog:allow-save`、`shell` plugin (コマンド実行は #61 の専用 Rust command で行う)。

### 1.4 既知の制約

- ダイアログで選んだディレクトリは、plugin-dialog が実行時に fs の scope へ追加する (`recursive: true` を渡す)。このとき追加された scope は、このウィンドウに許可された fs コマンド全部 (書き込み系を含む) に効く。アプリを再起動すると失われる (`tauri-plugin-persisted-scope` は導入していない)。再起動後に拡張ディレクトリを読むには再選択が必要になる。永続化は後続の判断事項である。
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
- Node の `timeout` は SIGTERM、こちらは強制終了 (Unix は SIGKILL) である。SIGTERM を握りつぶす子プロセスも止まる。孫プロセスは止めない。
- 出力は UTF-8 として解釈する (不正なバイトは U+FFFD)。
- `command_exists` は Rust 側の PATH 探索 (実行可能なファイルがあるか。Windows は `PATHEXT` を試す) で、`/bin/sh -c 'command -v'` / `where` は呼ばない。シェルの組み込みコマンドやエイリアスは見つけない。

### 2.2 セキュリティモデル (許可リスト)

validator は任意の拡張パッケージから来るため、webview から呼べる command は「何でも実行できる」口にしてはいけない。許可は 2 層ある。

1. 権限: command は `build.rs` の app manifest に登録してあり、`allow-run-command` / `allow-command-exists` を持つ capability のウィンドウ (`main`) だけが呼べる。
2. スコープ: 許可するプログラム名のパターンは `src-tauri/capabilities/platform.json` の `{ "program": "..." }` で宣言し、Rust は `CommandScope` から読む (Rust にリストを埋め込んでいない)。スコープが空なら全拒否する。

現在の許可パターン: `git`、`node`、`npm`、`python`、`python3`、`python3.*` (`*` は任意の文字列)。

照合の規則は次のとおり。

- 照合対象は、ディレクトリ部と末尾の `.exe` / `.cmd` を除いたファイル名 (大文字小文字は区別しない)。`.bat` は除かない (= 拒否される)。
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

判断: Tauri にはシェル経由の経路を作らない。Rust 側に `exec` 用の command は無い。#60 の Tauri 実装 `exec` は、この形 (`"<絶対パス>" <空白区切りの引数>`) だけを厳密に解析して `run_command` に委譲する (`docs/migration/tauri-platform.md` の 3 章)。クォートやシェルのメタ文字を含む引数、先頭が `"` で始まらない文字列は、実行せず明示的なエラーにする。

### 2.4 テスト

`cd src-tauri && cargo test`: 許可リスト (許可、拒否、相対パス、空スコープ)、`command_exists`、実プロセスでの終了コード、出力、非ゼロ終了、ENOENT / EACCES、`cwd`、`env`、タイムアウト、`maxBuffer`、シグナル、引数がシェルに解釈されないこと (Unix のみ `/bin/sh` と `/bin/echo` を使うテスト)。
