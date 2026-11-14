# Phase 6-2: Web Worker 版 code runner

Issue #38 の成果物である。現行の挙動と判定は `code-runner-behavior.md` (#37) を参照。**この変更では既存の runner を置き換えていない**。`code_runner.js`、`runner.js`、`ValidationHelper.js`、`index.js` は未変更で、新しい runner は追加のファイルだけである。アプリへの配線は #39、`pullVarsFromQuestIdeUserCodeLocalScope` の移行は #40 / #26 で行う。

## 1. ファイル

| ファイル | 内容 |
| --- | --- |
| `public/code_runner/worker.js` | Worker 側。Babel を通らない古典 (classic) Worker スクリプト。import も `require` も使わない。 |
| `src/js/app/common/codeRunnerWorker.js` | ホスト側。`createCodeRunnerWorker({ workerUrl, createWorker })`。`electron` / `fs` / `vm` / `child_process` を import しない。 |
| `src/test/app/common/codeRunnerWorker.test.js` | ホスト側の単体テスト (偽の Worker)。 |
| `src/test/app/common/codeRunnerWorkerScript.test.js` | Worker スクリプトの論理を、偽の Worker スコープ (`vm` の新しいコンテキスト) で評価するテスト。 |
| `src/test/app/common/codeRunnerWorker.integration.test.js` | 実際の Web Worker で `worker.js` を `file:` URL から読み込むテスト。 |

### Worker スクリプトの置き場所

リポジトリのビルドは Babel で `src/js` を `public` へコンパイルするだけで、バンドラは無い。`public/code_runner/runner.js` と同様に、`public/code_runner/worker.js` をそのままコミットした静的ファイルとして置く。これは次の理由による。

- `new Worker(url)` は URL でファイルを読むので、1 つの自己完結したプレーンな JS ファイルが必要である。
- `public` 全体がリリースの tarball に入る (`tasks/create_release.js`)。
- URL は `staticFileUrl('code_runner/worker.js')` (`fs_utils`) で得られる (Electron の `file:` URL)。Tauri では asset プロトコルの URL を渡す。ホスト側の `workerUrl` は注入式なので、モジュール自体は URL の作り方を知らない。`WORKER_RELATIVE_PATH` (`'code_runner/worker.js'`) を export してある。
- テストでは、リポジトリ上の実ファイルの絶対 `file:` URL を使う (document 相対の URL は使わない)。

## 2. プロトコル (`postMessage`)

ホストと Worker は同じ定数を、それぞれのファイルに持つ (Worker からは import できない)。

| 方向 | メッセージ | 備考 |
| --- | --- | --- |
| ホスト → Worker | `{ type: 'run', code: string, env: { [name]: string } }` | Worker 1 つにつき 1 回だけ。2 回目と未知の `type` は、Worker が `error` の `log` で通知する。 |
| Worker → ホスト | `{ type: 'log', logLevel: 'log' \| 'info' \| 'warn' \| 'error', arguments: any[] }` | 現行の `code_runner:log` のペイロード (`{ logLevel, arguments }`) と同じ形。ホストは `type` を除いて `log` イベントとして emit する。 |

完了通知と戻り値は無い (現行にも無い)。エラーはすべて `logLevel: 'error'` の `log` で、引数は `{ message, stack }` のプレーンオブジェクトである。`QuestIDE.jsx` が「エラーらしい形」と判定する形と同じ。

### 引数のシリアライズ

`worker.js` が、すべての console 引数を structured clone で必ず送れる値に変換する。規則の全体は `code-runner-behavior.md` の 4.2 章と、`worker.js` の冒頭コメントにある。要点は次のとおり。

- 関数は `"[Function: name]"`、`Symbol` / `bigint` は文字列、`Error` は `{ message, stack }`、循環は `"[Circular]"`、深さ 20 超は `"[Max depth exceeded]"`。
- 1 回の console 呼び出しあたり、全引数あわせて 100000 ノード (`MAX_SERIALIZE_NODES`) まで変換する。超えた分は `"[Truncated: too many nodes]"` に置き換える (共有された非循環の参照が指数的に展開されるのを防ぐ。配列とオブジェクトは超えた時点で打ち切る)。
- 入力値のメソッドは呼ばない。配列は添字ループで新しい配列に変換し、`Date` / `Map` / `Set` / `RegExp` / 型付き配列は組み込みのメソッドを使うので、ユーザーコードが `map` や `toString` を上書きしても影響しない。getter や Proxy のトラップが例外を投げる場合は、その値だけを `"[Getter threw: ...]"` / `"[Unserializable: ...]"` にして、呼び出し全体は失われない。
- `DataCloneError` で呼び出しが失われることは無い。シリアライズ自体が例外 (Proxy のトラップなど) を投げた場合は、その旨を `error` の `log` で明示する。

### 失敗の経路

| 事象 | 経路 |
| --- | --- |
| ユーザーコードの同期例外 | Worker が `console.error('There was a problem executing your code:', { message, stack })` (現行と同じ文言) |
| 非同期の未捕捉例外 / 未処理の Promise 拒否 | Worker が `error` / `unhandledrejection` を購読し、`{ message, stack }` を `error` で送る。`preventDefault()` でホストの `Worker.onerror` への二重通知を避ける |
| `worker.js` が読み込めない、または Worker のトップレベルが例外 | ホストが Worker の `error` イベントを受け、`Code runner worker failed: ...` を `error` の `log` で emit し、その Worker を停止する |
| ホストが解釈できないメッセージ | ホストが `Code runner received an unexpected message from the worker` を `error` の `log` で emit |
| 受信メッセージの deserialize 失敗 (`messageerror`) | ホストが `error` の `log` で emit |
| `runCode` の引数が不正 (`code` が文字列でない、`env` がプレーンオブジェクトでない、`env` の値が文字列でない) | `TypeError` を投げる (Worker は作らない。実行中の Worker も止めない) |
| Worker の作成が同期的に失敗 (`Worker` が無い環境を含む) | 元の例外をそのまま投げる |
| `postMessage` が投げる | Worker を停止して再スローする |

## 3. ホスト側 API

```js
import { createCodeRunnerWorker, WORKER_RELATIVE_PATH } from './codeRunnerWorker';

const runner = createCodeRunnerWorker({
  workerUrl, // 必須。worker.js の絶対 URL
  createWorker, // 任意。(url) => Worker。既定はグローバルの `new Worker(url)`
});
runner.on('log', ({ logLevel, arguments }) => {});
runner.runCode(code, env); // 戻り値なし。現行の code_runner.js と同じ形
runner.terminate();
```

- `runner` は `EventEmitter` で、`runCode` / `terminate` と `log` イベントは `code_runner.js` と同じ契約である。
- モジュールの読み込み時や `createCodeRunnerWorker` の呼び出し時には Worker を作らない。`runCode` で初めて作る。`workerUrl` が無ければ `TypeError` (既定値は無い)。
- `runCode` のたびに新しい Worker を作る。実行中の Worker は `terminate()` で止め、`Terminated.` は出さない (置き換えは無音)。古い Worker からのメッセージは、現在の Worker と同一でなければ破棄する。
- `terminate()` は実行中の Worker を `worker.terminate()` で止めて参照を破棄し、`{ logLevel: 'log', arguments: ['Terminated.'] }` を emit する。何も実行していなくても出す (現行は常にダミーコードが `Terminated.` を出す)。2 回呼んでも Worker の `terminate()` は 1 回だけ。
- `worker.terminate()` は直ちに効き、同期の無限ループも止まる (統合テストで確認)。止めた後のメッセージは届かない。

## 4. Worker の中の環境

| 項目 | 内容 |
| --- | --- |
| 評価 | 間接 eval (`(0, eval)(code + '\n//# sourceURL=script.js')`)。`vm.runInThisContext` と同様にグローバルスクリプトとして動く (`this` はグローバル、`var` と関数宣言はグローバルになる)。 |
| スタック | 最上位と無名関数のフレームは `at eval (script.js:L:C)` と出るので、`at script.js:L:C` に書き換える。最後の `script.js` フレームより下のランナー内部のフレームは削る。`QuestIDE.jsx` の `at script.js` による打ち切りと、パスを見せない要件が成り立つ。 |
| `process.env` | `process = { env }` の最小の shim。`env` の値は文字列のみ (違反は明示的なエラー)。ホストが送ったオブジェクトのコピーで、実行中に書き換えられる。`process` の他のメンバーは無い。Node の `process.env` へのマージ (`Object.assign(process.env, env)`) とは違い、送られた値だけになる。 |
| `String.prototype.replaceAll` | 無いランタイムでだけ定義する。文字列の引数をリテラルとして扱う (runner.js のポリフィルは正規表現として解釈していた)。ユーザーコードとは別に実行するので、行番号に影響しない。 |
| `require`、`module`、`window`、`document` | 無い。使うと `ReferenceError` が `error` の `log` として表示される (明示的な失敗)。 |
| `fetchOverride` | 移植していない (`api-05-get-patch` 専用の回避策)。`fetch` はそのまま Worker の `fetch`。 |
| 実行ごとの状態 | Worker を作り直すので、グローバル変数、タイマー、Promise は引き継がれない。 |

## 5. テストと検証の範囲

| 内容 | 方法 |
| --- | --- |
| ホストのプロトコル (`run` メッセージ、`log` の変換、再実行、`terminate`、`error`、`messageerror`、不正な引数、作成失敗) | 偽の Worker を `createWorker` で注入 (`codeRunnerWorker.test.js`) |
| `worker.js` の論理 (console、シリアライズ、env、エラー、プロトコル違反、ポリフィル) | `vm.createContext` の中で `worker.js` を評価し、偽のスコープ (`postMessage`、`addEventListener`、`console`) を与える (`codeRunnerWorkerScript.test.js`) |
| 実際の Worker での動作 (4 つの console レベル、`process.env`、`require` が無いこと、structured clone を通る引数、同期エラーのスタック、タイマー内の例外、未処理の拒否、`terminate()` 後に何も届かないこと、同期の無限ループの停止、作り直し、読み込めない URL) | Jest が Electron のレンダラ (`@jest-runner/electron`) で動くため、実際の `Worker` が使える。リポジトリ上の `public/code_runner/worker.js` の `file:` URL を読み込む (`codeRunnerWorker.integration.test.js`)。各待機に 5 秒のタイムアウトがある |

### この環境で確認できていないこと

- Tauri の webview での `file:` / asset プロトコルからの Worker の読み込み。asset プロトコルの URL と CSP (`worker-src`、Worker 内の `eval` に必要な `script-src 'unsafe-eval'`) は、Tauri 側の設定が決まってから確認する。
- 実際のゲーム (Electron 11) の本体ウィンドウからの `new Worker(file URL)`。テストは Jest のウィンドウで動いているため、ゲームのウィンドウと `webPreferences` が同じとは限らない。#39 で配線した後に、次の手動確認をする。

### 手動確認 (ユーザーが実施)

#39 で配線した後に、QuestIDE で次を確認する。

1. `console.log('hi', { a: 1 })` が表示される。
2. `console.log(function f() {})` が `[Function: f]` と出る。
3. `throw new Error('x')` で `There was a problem executing your code:` と `x` とスタック (`at script.js` で終わる) が出る。
4. `setTimeout(() => { throw new Error('later'); }, 10)` と `Promise.reject(new Error('r'))` がエラーとして出る。
5. `while (true) {}` を実行したあと、再実行またはインターフェースを閉じるとゲームが固まらず、`Terminated.` が出る。
6. `process.env.TQ_TWILIO_NUMBER` (環境変数を設定した状態) が読める。

## 6. #39 (配線) で必要になること

- `code_runner.js` を `createCodeRunnerWorker({ workerUrl: staticFileUrl(WORKER_RELATIVE_PATH) })` のシングルトンに置き換える。`QuestIDE.jsx` / `HackInterface.jsx` の呼び出し (`on('log')`、`runCode(code, env)`、`terminate()`) はそのまま使える。
- `runCode` の `env` の値が文字列でない場合は `TypeError` になる。`QuestIDE.jsx` の `getContext('env')` から作る `env` の値が必ず文字列か、配線時に確認する (違えば変換側を明示的に直す)。
- `runCode` は同期的に例外を投げうる (引数不正、Worker 作成失敗)。`QuestIDE.runCode` の `async` 関数の中で呼ばれているので、未処理の拒否になる。表示するかどうかを決める。
- Worker が `require` を持たないので、`code-runner-behavior.md` の 6 章の「不可」の 12 目標が動かなくなる。配線前か同時に、Phase 5 でコンテンツを書き換えるか、その目標でのエラー表示を許容する。
- `api-05-get-patch` の `fetchOverride` を、Worker に組み込むか、コンテンツを変えるか決める。
- `docs/baseline/platform-boundary.md` の `code_runner.js` の行を、配線後に更新する。
