# Phase 5f: twilioquest-open-source の取り込みと Node 専用 API の除去

Issue #34。`twilioquest-open-source@2.0.1` (`public/package-lock.json` が解決していた版。tarball の `integrity` が一致することを確認済み) を `public/content/twilioquest-open-source/` に取り込み、実行時に読み込まれる JS から Node 専用 API を取り除いた。ミッション (`open_source`) の流れ、合否の文言、報酬は変えていない。

## 1. 取り込み

- 1 つ目のコミットは tarball の `package/` と同一の 136 ファイルのみ (改変なし)。2 つ目のコミットで下記の編集を行った。
- `vendoredExtensionModules.json` に名前を追加、`public/package.json` から依存を削除、`public/package-lock.json` から `twilioquest-open-source` のエントリ (入れ子の `got` 依存群を含む) を削除した。`command-exists`、`fs-jetpack`、`got`、`lodash.merge` は `public/package.json` の直接の依存として残っている (他のパッケージと本体コードが使う) ので、追加の対応は不要。
- `package.json` の `dependencies` (`command-exists`、`fs-jetpack`、`got`、`lodash.merge`) は出所の記録として原文のまま残した。実行時にはもう使われない。
- 入口から到達する JS が `require` するのは、相対パス、`.json`、許可リスト内の `path` と `lodash.merge` だけになった (`vendoredOpenSource.test.js` で新ローダーに全件を読み込ませて確認)。

## 2. ファイルごとの変更 (前 -> 後)

| ファイル | 前 | 後 |
| --- | --- | --- |
| `scripts/objectiveValidation.js` | `util.promisify(child_process.exec)` で `"<TQ_GIT_EXE>" <引数文字列>` をシェル実行 | `execGitWithArgs(helper, args[], {cwd})` が `helper.exec(TQ_GIT_EXE, args, {cwd})` を実行 (シェルなし)。`TQ_GIT_EXE` 未設定、引用符付きのときのエラー文言は同じ。終了コードが 0 以外なら、従来の `exec` と同様に `Command failed: "<exe>" <args>` + stderr のメッセージで reject (`code`、`stdout`、`stderr` を付与) |
| `03_install_git` | `child_process.spawn(gitPath, ['--version'])` | `helper.exec(gitPath, ['--version'])`。コード 0 で成功 (`GIT_EXE` を設定)、それ以外は同じ失敗文言。`isExecutableValid` は従来どおり |
| `03b_configure_git` | `` `config --list` `` | `["config", "--list"]` |
| `04_git_clone` | `fs-jetpack` の `existsAsync` / `readAsync` | `helper.fs.existsAsync` / `helper.fs.readAsync` (同じ戻り値) |
| `05_git_branch` | `` `branch --list ${branchName}` `` | `["branch", "--list", branchName]` |
| `06_make_edits` | `fs-jetpack` と `` `log _data/pixels.json` `` (`timeout: 2000`) | `helper.fs.*` と `["log", "_data/pixels.json"]`。`timeout` は外した (後述) |
| `06b_commit_hash` | `` `show ${commitHash}` `` | `["show", commitHash]`。空のときは従来どおり `["show"]` (`git show` だけ) |
| `07_sync_master` | `remote -v`、`got` 2 回 | `["remote", "-v"]`、`fetch` 2 回 |
| `07b_merge_master` | `` log master -n 1 --pretty=format:"%H" ``、`` branch --contains ${hash} `` | `["log","master","-n","1","--pretty=format:%H"]`、`["branch","--contains",hash]` (シェルが外していた引用符は不要) |
| `01`, `02`, `08`, `09`, `11`, `12` | `got(url, {throwHttpErrors: false})` | `fetch(url)` |

`events.js` の `lodash.merge` と、`scripts/` のほかのファイルは変更していない。

## 3. `got` から `fetch` へのエラーの扱い

すべての呼び出しが `throwHttpErrors: false` だったので、非 2xx は例外ではなく `statusCode` で分岐していた。これを `response.status` の比較に置き換えただけで、分岐と文言は同じ (`HTTPError` に頼っていた箇所は無い)。

- `response.statusCode` -> `response.status`。本文は `JSON.parse(response.body)` -> `await response.json()`。JSON が不正な場合は、従来と同じく `try` の `catch` で `Something went wrong ... ${err}` を出す。
- ネットワーク障害は、`got` では `RequestError`、`fetch` では `TypeError: Failed to fetch` が投げられ、どちらも `catch` で `${err}` として表示される (本文のエラー名は変わる)。
- `07_sync_master` の失敗文に付けていた `statusMessage` は、HTTP/2 では `fetch` の `statusText` が空になるため、`<status> <statusText>` (例: `404 Not Found`) にした。ここだけ文言が変わる。
- `got` は GET を 5xx や 429 などで自動再試行していた。`fetch` は再試行しない。学習者が再度 HACK を押せば済む。
- `fetch` は検証関数のグローバルを使う (Electron の renderer、新ローダーの `new Function` どちらでも `window.fetch` が見える)。

## 4. ホスト API について

新しいホスト API は追加していない。

- `timeout: 2000` (`06_make_edits` の `git log`) は `helper.exec` が対応していないため外した。非対話の `git log` は端末が無ければページャーを起動せず、終了する。
- GitHub API (`api.github.com`) は `Access-Control-Allow-Origin: *` を返すため、Tauri の webview からの `fetch` も通る見込み。ただし未確認である。CORS で拒否される場合は、ホスト側の汎用 HTTP ヘルパー (`helper.httpGet` など) が必要になる。フォローアップとして残す。
- 目標 `07_sync_master` と `08_push_upstream` の `example.js` は `Buffer.from(...)` を使う (学習者のコード、QuestIDE)。Worker に `Buffer` が無いため `atob` への書き換えが必要で、`code-runner-behavior.md` に記載済み。本チケットの範囲外。

## 5. 学習者への影響

- ミッションの流れ、`TQ_*` 環境変数、成功と失敗の文言、報酬は変わらない。Twilio アカウントに依存する箇所はこのミッションに無い。
- 文言が変わるのは 07 の失敗時のステータス表示だけ。
- `git` は、シェルを経由せず引数配列で実行される。パスに空白があっても、引用符を付けた環境変数を要求しない (従来から引用符は禁止)。

## 6. テスト

`src/test/app/common/vendoredOpenSource.test.js`:
- レイアウト、`dependencies` に残っていないこと。
- 実行時入口の全ファイルを新ローダー + 実際の許可リストで読み込めること (失敗 0 件)、Node 専用モジュールの `require` が残っていないこと。
- 書き換えた検証関数 (01、02、03、03b、04、05、06、06b、07、07b、08、09、11、12) それぞれの成功系と失敗系。`helper` はフェイク (`fs`、`exec`、`fetch` を差し替え)。

## 7. 手元での確認 (アプリは起動していない)

1. `npm install` して起動し、設定の拡張機能一覧に `twilioquest-open-source` が同梱として出ること。
2. Forest of Open Source を開き、01: GitHub ユーザー名 (実在 / 存在しない / 空)、02: フォークの有無、03: git の実行パス (正しい / 存在しない / git 以外)、03b: `user.name` / `user.email`、04: クローン先ディレクトリ、05: ブランチ (作成のみ / チェックアウト済み)、06: ピクセル追加とコミット、06b: コミットハッシュ、07: `upstream` と同期、07b: master のマージ、08: ブランチの push、09: PR 番号、11: マージ済み PR、12: 別リポジトリの PR を順に試す。
3. 07 で `upstream` の URL が正しいのに失敗する場合、ネットワーク (CORS を含む) のエラー表示を確認する。
4. Windows で、パスに空白を含む git (`C:\Program Files\Git\...`) が 03b 以降で動くこと。
