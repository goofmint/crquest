# Phase 4-4 / 4-5 / 6-3 / 6-4: Worker 版 runner の配線と ValidationHelper

Issue #39 (`code_runner.js` を Worker に差し替え)、#26 / #40 (`pullVarsFrom*UserCodeLocalScope` を `vm` 非依存にして Worker に接続)、#27 (`evalQuestIdeUserCode` の扱い) の成果と決定事項である。Worker 本体の仕様は `code-runner-worker.md`、現行挙動の棚卸しは `code-runner-behavior.md` を参照。

## 1. #39: code_runner.js の差し替え

- `src/js/app/common/code_runner.js` は `createCodeRunnerWorker({ workerUrl: staticFileUrl(WORKER_RELATIVE_PATH) })` のシングルトンになった。`BrowserWindow` / `ipcRenderer` / `remote` / `fs-jetpack` は使わない。公開面 (`runCode(code, env)`, `terminate()`, `log` イベント) は変わらず、`QuestIDE.jsx` と `HackInterface.jsx` の呼び出しはそのまま動く。
- `public/code_runner/runner.html` と `runner.js` は参照元が無くなったが、削除していない (この変更の範囲外)。
- Worker ファイルの配信: `public/code_runner/worker.js` はコミット済みの静的ファイルで、Vite のバンドル対象ではない (`vite.config.mjs` は `publicDir: false` / `emptyOutDir: false`、`public/` を触らない)。`npm run build:all` の後も `public/code_runner/worker.js` は無変更で残り、`staticFileUrl('code_runner/worker.js')` が `file:` URL (`public/index.html` からの相対) を作る。`new Worker(url)` はこの URL から作られる。`public/` 全体が配布物に入る。
- `QuestIDE.runCode` は `codeRunner.runCode` の同期例外 (環境変数の値が文字列でない、Worker を作れない) を `consoleLog` で画面に出す。以前は未処理の Promise 拒否で見えなかった。
- 実機 (Electron 11 のゲームウィンドウ) からの `new Worker(file URL)` は未確認。`code-runner-worker.md` 5 章の手動確認を行う。

## 2. #26 / #40: pullVars を Worker で実行

`ValidationHelper.pullVarsFromUserCodeLocalScope(userCode, keys)` と `pullVarsFromQuestIdeUserCodeLocalScope(keys, objective, mission)` は `vm` を使わない。`pullVarsInWorker` (`codeRunnerWorker.js`) が実行のたびに使い捨ての Worker を作り、`{ type: 'pull', code, keys, env }` を送る。QuestIDE の runner の Worker には触らない。

Worker (`worker.js` の `pull`) は、ユーザーコードと `__TQ["key"] = key;` の読み出しを 1 つの間接 eval で実行する (トップレベルの `let` / `const` / `class` は eval の中のスコープなので、同じスクリプトに置く必要がある)。結果は `{ type: 'vars', vars }` か `{ type: 'vars-error', error }` で返る。

### 返り値の形 (従来と同じ)

| 状況 | 結果 |
| --- | --- |
| 正常 | `{ key: value, ... }` |
| 変数の読み出しで例外 (未定義の `ReferenceError` など) | それまでに読めた変数と `_error` (Error。`name` / `message` / `stack` は保たれる) |
| ユーザーコード自体が例外 (構文エラー含む) | Promise が reject。`name` / `message` / `stack` を持つ `Error` |

### 従来との差分

| 項目 | 従来 (`vm.Script.runInNewContext`) | 今回 |
| --- | --- | --- |
| 実行回数 | 2 回 (まず単体、次に読み出し付き) | 1 回 (副作用が 2 重にならない) |
| スコープ | `fetch` (`fetchOverride`)、`window`、`process`、`URL`、`URLSearchParams`、`require` | Worker のグローバルだけ。`process.env` は空の shim (`{}`)。`require` / `window` は無く、`ReferenceError` になる。`fetchOverride` は無い (`fetch` は Worker の `fetch`)。`ValidationHelper.fetchOverride` 自体は残してある |
| `keys` | 検証なし (文字列に埋め込んで評価) | 識別子 (`/^[A-Za-z_$][A-Za-z0-9_$]*$/`) でなければ明示的に reject (コード注入の防止) |
| 実行時間 | 無制限 (無限ループでアプリが固まる) | 10 秒 (`PULL_VARS_TIMEOUT_MS`)。超えたら Worker を止めて reject |
| コンソール出力 | 捨てられる | 捨てられる (同じ) |
| `String.prototype.replaceAll` ポリフィル | コードの前に挿入 | Worker 側で、無いときだけ定義 (行番号に影響しない) |

### 関数・クラスの扱い (重要な決定)

値は structured clone で Worker の境界を越える。次のようになる。

| 値 | 結果 |
| --- | --- |
| 数値、文字列、真偽値、`null`、`undefined`、配列、プレーンオブジェクト、`Map`、`Set`、`Date`、`RegExp`、型付き配列、`Error` | そのまま届く |
| クラスのインスタンス | プレーンオブジェクトとして届く (自分のプロパティのみ。プロトタイプ、メソッド、getter は失われる) |
| 関数、クラス、`Symbol`、それらを含むオブジェクト | **Promise が reject する。** `Variable "f" (function) cannot be returned from the code runner worker: only structured-cloneable values are supported (functions, classes and symbols are not): ...` |

関数を境界の向こうで呼べるようにする方法は採らなかった。ソース文字列をホストで `eval` / `new Function` する案は、クロージャを失い、ユーザーコードをホストで直接実行することになる (Worker に移す目的に反し、Tauri の CSP とも合わない)。非同期のリモート関数プロキシは、バリデータが `fn(x)` を同期的に呼んで比較する形なので互換性が無い。フォールバックはしない (関数だけを黙って落とす、文字列化して返す、は行わない)。

### 影響を受けるコンテンツ (Phase 5 で対応)

`public/content` は変更していない。次のバリデータは関数またはクラスを要求し、呼び出して検証する。これらは上記のエラーで失敗する (学習者には `helper.fail` のメッセージとして出る)。コンテンツ側を「Worker の中でテストケースを実行して結果 (データ) だけを返す」形に書き換える必要がある (Phase 5)。

- `twilioquest-javascript` (`pullVarsFromUserCodeLocalScope`): `forEach`, `js_declare_function`, `js_function_arguments`, `loopFilter`, `loopGetIndexes`, `loopMap`, `loopReduce`, `js_split_east_laser` (関数)、`js_split_north_laser`, `classes` (クラス)
- `twilioquest-api-academy` (`pullVarsFromQuestIdeUserCodeLocalScope`): `api-01-local-function`, `api-02-async-await`, `api-04-remote-and-local`, `api-05-get-patch` (関数。`api-02` は `fs`、`api-05` は `fetchOverride` も必要)
- `twilioquest-base` (`pullVarsFromQuestIdeUserCodeLocalScope`): `sum-array`, `flatten-array`, `reverse-words`, `check-for-palindrome`, `balance-brackets`, `remove-duplicate-characters`, `difference-max-min`, `03-debugging-1/2/3` (関数)

変数 (データ) だけを要求するバリデータ (`js_declare_variable`, `js_declare_variable_multiple`, `arrays`) は従来どおり動く。

### QuestIDE のタスクが `fs` / `Buffer` / `http` をユーザーコードの中で使う場合 (範囲外)

Worker には `require`、`fs`、`Buffer`、`http` が無い (`code-runner-behavior.md` 6 章)。ユーザーコードが `require` を呼ぶと `ReferenceError: require is not defined` になる (pullVars では `ValidationHelper` の例外、runner では QuestIDE の画面に出る)。ホストの API を `postMessage` 経由で公開するなどの設計はここでは行わず、Phase 5 / 6 の残課題とする。

## 3. #27: evalQuestIdeUserCode

`evalQuestIdeUserCode(objective, mission)` は保存済みのユーザーコードをホストのレンダラで `eval` していた (戻り値なし。ローカルスコープの `eval` なので、効果は副作用だけ)。

調査: `grep -rn evalQuestIdeUserCode src public` の結果、定義 (`ValidationHelper.js`) 以外の参照は `docs/` だけで、`src/` にも `public/content` (全コンテンツパッケージ) にも呼び出しは無い。

決定: **削除した。** 利用者がいないため、Worker 経由で作り直す理由が無い。ホストの `eval` はユーザーコードを無制限の権限で実行するので、残すと Tauri の CSP / サンドボックス方針とも衝突する。`ValidationHelper.test.js` に「このメソッドが存在しない」ことのテストを置いた。副作用だけが必要なら `pullVarsFromQuestIdeUserCodeLocalScope([], objective, mission)` で Worker 上で実行できる。外部のコンテンツパッケージがこのメソッドを呼んでいた場合は `TypeError: helper.evalQuestIdeUserCode is not a function` で明示的に失敗する。
