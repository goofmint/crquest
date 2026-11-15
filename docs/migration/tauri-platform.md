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
