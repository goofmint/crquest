# Phase 5e: twilioquest-python の取り込みと Node 専用 API の除去

Issue #33。`twilioquest-python@1.0.7` (`public/package-lock.json` が解決していた版。tarball の `integrity` が一致することを確認済み) を `public/content/twilioquest-python/` に取り込み、実行時に読み込まれる JS から Node 専用 API を取り除いた。ミッション (`python`) の流れ、合否の文言、報酬は変えていない。

## 1. 取り込み

- 1 つ目のコミットは tarball の `package/` と同一の 129 ファイルのみ (改変なし)。2 つ目のコミットで下記の編集を行った。
- `vendoredExtensionModules.json` に名前を追加、`public/package.json` から依存を削除、`public/package-lock.json` から `twilioquest-python` のエントリを削除した。`fs-jetpack` は `public/package.json` の直接の依存として残っている (本体コードが使う) ので、追加の対応は不要。
- `package.json` の `dependencies` (`fs-jetpack`) は出所の記録として原文のまま残した。実行時にはもう使われない。
- 入口から到達する JS が `require` するのは、相対パス、`.json`、許可リスト内の `path` だけになった (`vendoredPython.test.js` で新ローダーに全件を読み込ませて確認)。

## 2. ホスト API の追加

`electron` (`remote.app.getPath("appData")`) の代わりに、`ValidationHelper` に小さな汎用メソッドを 1 つ追加した。

- `helper.getAppDataPath()`: OS のユーザー別アプリケーションデータのディレクトリ (`platform/paths` の `getAppDataPath()` そのまま、同期)。取得できなければ例外を投げる。フォールバックはない。

## 3. ファイルごとの変更 (前 -> 後)

| ファイル | 前 | 後 |
| --- | --- | --- |
| `scripts/objectiveValidation.js` | 読み込み時に `electron` の `remote` で appData を求め、`jetpack.dir` で `python_validator` を作成。`spawn` + `setTimeout` | 読み込み時の副作用なし。検証時に `helper.getAppDataPath()` から `<appData>/TwilioQuest/python_validator/validate.py` を求め、`helper.fs.writeAsync` が親ディレクトリを作る (同じ場所)。`spawn` は `helper.exec` |
| `checkSetup(py, path)` | `jetpack.existsAsync` | `checkSetup(helper, py, path)`、`helper.fs.existsAsync`。文言は同じ |
| `executeScript(py, code, args)` | `spawn`。終了コード 0 で stdout を返す。それ以外は `error.txt` を書いて `NiceError`。30 秒で `NiceError` | `executeScript(helper, py, code, args)`。`helper.exec(py, [code, ...args])` の `code`、`stdout`、`stderr` で同じ分岐。30 秒の打ち切りは `Promise.race` + `setTimeout` (子プロセスを止めない点も従来どおり) |
| `executePythonCode(env, code, args)` | `jetpack.writeAsync` + `spawn`。終了コードによらず `{exitCode, stdout, stderr}` を返す。起動失敗は `NiceError`。5 秒で `NiceError` | `executePythonCode(helper, code, args)`。同じ戻り値と `NiceError` (起動失敗は `helper.exec` の reject を変換)。5 秒の打ち切りも同じ |
| `writeFile(codePath, ...)` | `jetpack.writeAsync` | `writeFile(helper, codePath, ...)`、`helper.fs.writeAsync` |
| `python_basics_install` | `spawn(pythonPath, ['--version'])`、stdout と stderr を連結 | `helper.exec(pythonPath, ['--version'])`。`stdout + stderr` を連結 (Python 2 は stderr に出す)。終了コード 0 以外の文言は同じ |
| `python_basics_hello`、`variables`、`numbers_math`、`booleans`、`lists`、`dictionaries`、`functions`、`function_args`、`functions_return`、`challenge`、`conditional`、`strings`、`fizzbuzz`、`iterate_list`、`script_args` | `fs-jetpack` (`existsAsync`、`readAsync`) と上記の関数 | `helper.fs.existsAsync` / `helper.fs.readAsync` と、`helper` を渡す上記の関数 |

`events.js`、`objects/**`、そのほかの `scripts/` は変更していない (`require` は相対パスと `package.json` のみ)。`python_basics_repl` と `python_basics_final` は `NiceError` を使うだけで変更なし。

## 4. spawn から exec への意味の違い

- 起動失敗 (ENOENT など) は、`spawn` では `error` イベント (`install` では未処理で例外になりうる) だったが、`helper.exec` では reject になる。`install` では外側の `catch` の汎用文言、`executeScript` ではそのまま reject (汎用文言) になる。
- シグナルで終了した場合は `helper.exec` が reject する。従来 `install` の失敗文言に出ていた `Error signal:` は、終了コードで終わった場合の `null` のまま出す。
- 出力は終了後にまとめて返る (逐次ではない)。`install` の stdout と stderr は「stdout の後に stderr」の順で連結される (Python が片方にしか書かないので差は出ない)。出力の上限は `execFile` の `maxBuffer` (学習者のスクリプトの出力が大きいと reject)。
- `helper.exec` はシェルを使わない。引数は配列のままなので、パスに空白があってもよい。

## 5. 学習者への影響

- ミッションの流れ、`TQ_*` 環境変数、成功と失敗の文言、報酬は変わらない。Twilio アカウントに依存する箇所はこのミッションに無い。
- `validate.py` と `error.txt`、`output.txt` の場所は従来と同じ。

## 6. テスト

`src/test/app/content/vendoredPython.test.js`:
- レイアウト、`dependencies` に残っていないこと。
- 実行時入口の全ファイルを新ローダー + 実際の許可リストで読み込めること (失敗 0 件)、Node 専用モジュールの `require` が残っていないこと。
- `objectiveValidation` の各関数 (成功、非 0 終了、起動失敗、30 秒と 5 秒のタイムアウト、appData の取得失敗)。
- 書き換えた検証関数 (`install`、`hello`、アサーション付き 9 件、出力検査の `iterate_list`、`fizzbuzz`、`conditional`、`script_args`、`strings`) の成功系と失敗系。`helper` はフェイク。
- `ValidationHelper.test.js` に `getAppDataPath` の 2 件を追加。

## 7. 手元での確認 (アプリは起動していない)

1. `npm install` して起動し、設定の拡張機能一覧に `twilioquest-python` が同梱として出ること。
2. Pythonic Temple を開き、最初の障壁 (install) で、Python 3 のパス (正しい / 存在しない / Python 2) を試す。
3. hello 以降で、`TQ_PYTHON_CODE_PATH` の中のスクリプトを順に試す。正解、アサーション失敗 (文言に `AssertionError` の内容が出る)、ファイル無しを確認する。
4. スクリプトを例外で落とすと `error.txt` が、iterate_list を間違えると `output.txt` が、コードフォルダに作られること。
5. `<appData>/TwilioQuest/python_validator/validate.py` が作られること。
6. Windows で、パスに空白を含む Python (`C:\Program Files\...`) が動くこと。
