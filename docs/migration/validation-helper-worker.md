# Phase 4-4 / 4-5 / 6-3 / 6-4: Worker 版 runner の配線と ValidationHelper

Issue #39 (`code_runner.js` の Worker 化)、#26 / #40 (`pullVars` の `vm` 非依存化)、#27 (`evalQuestIdeUserCode`) の状況と決定事項である。Worker 本体の仕様は `code-runner-worker.md` を参照。

## 状況

| 項目 | 状況 |
| --- | --- |
| #39 runner の差し替え | 完了 |
| #27 `evalQuestIdeUserCode` | 削除済み (完了) |
| #26 / #40 `pullVars` の Worker 化 | **未配線**。`pullVars*` は Electron 期間中は従来どおり `vm` を使う。Worker 側の `pull` は土台として存在するが `ValidationHelper` から呼ばない |

## 1. #39: code_runner.js の差し替え (完了)

- `src/js/app/common/code_runner.js` は `createCodeRunnerWorker({ workerUrl: staticFileUrl(WORKER_RELATIVE_PATH) })` のシングルトン。`BrowserWindow` / `ipcRenderer` / `remote` / `fs-jetpack` は使わない。公開面 (`runCode`, `terminate`, `log`) は不変。
- `public/code_runner/worker.js` はコミット済みの静的ファイルで、Vite のバンドル対象ではない (`publicDir: false`)。`staticFileUrl('code_runner/worker.js')` の `file:` URL から `new Worker(url)` で作る。
- `QuestIDE.runCode` は `codeRunner.runCode` の同期例外を画面に出す。
- `runner.html` / `runner.js` は未削除。実機の Electron 11 での Worker 起動は未確認 (`code-runner-worker.md` 5 章の手動確認)。

## 2. #27: evalQuestIdeUserCode (完了)

`grep` の結果、定義以外の呼び出しは `src` にも `public/content` にも無い。ホストでの `eval` は Worker 化の方針と Tauri の CSP に反するため**削除**した (テストで不在を確認)。副作用だけが必要なら `pullVarsFromQuestIdeUserCodeLocalScope([], objective, mission)` を使う。

## 3. #26 / #40: pullVars は `vm` のまま (Worker 版は未配線)

### 決定

`pullVarsFromUserCodeLocalScope` / `pullVarsFromQuestIdeUserCodeLocalScope` は main と同じ `vm` 実装を維持する。理由: 24 個の動作中のバリデータが、返された関数・クラスを同期的に呼んで検証している。Worker 境界は structured clone なので関数・クラスを返せず、置き換えると 24 個が壊れる。

- 24 個の内訳:
  - `twilioquest-javascript` (`pullVarsFromUserCodeLocalScope`): `forEach`, `js_declare_function`, `js_function_arguments`, `loopFilter`, `loopGetIndexes`, `loopMap`, `loopReduce`, `js_split_east_laser`, `js_split_north_laser`, `classes`
  - `twilioquest-api-academy` (`pullVarsFromQuestIdeUserCodeLocalScope`): `api-01-local-function`, `api-02-async-await`, `api-04-remote-and-local`, `api-05-get-patch`
  - `twilioquest-base` (同上): `sum-array`, `flatten-array`, `reverse-words`, `check-for-palindrome`, `balance-brackets`, `remove-duplicate-characters`, `difference-max-min`, `03-debugging-1/2/3`
- データだけを返すバリデータ (`js_declare_variable`, `js_declare_variable_multiple`, `arrays`) も、挙動を揃えるため `vm` のまま。

### 土台として残したもの (未配線)

- `public/code_runner/worker.js` の `pull` メッセージ、`codeRunnerWorker.js` の `pullVarsInWorker` と、そのテスト (単体・実 Worker 統合)。
- 仕様: コードを 1 回だけ実行し、要求した最上位変数を返す。変数読み出しの例外は `_error`、ユーザーコードの例外は reject。`keys` は識別子のみ。10 秒のタイムアウト。値は structured clone 可能なものだけで、関数・クラス・Symbol・それを含むオブジェクトは変数名を示す明示エラーで reject する (フォールバックなし)。`process.env` は空の shim で、`require` / `window` / `fetchOverride` は無い。

### 今後 (別途追跡)

コンテンツを「テストケースを Worker の中で実行して、データだけを返す」形に書き直してから、`ValidationHelper` を `pullVarsInWorker` に接続する。**Tauri 化の前に `vm` は必ず外す** (Tauri に Node の `vm` は無い)。

### QuestIDE のユーザーコードが `fs` / `Buffer` / `http` を使う場合 (範囲外)

Worker には `require`、`fs`、`Buffer`、`http` が無く、`ReferenceError: require is not defined` になる。ホスト API の公開などはここでは設計しない (Phase 5 / 6 の残課題)。
