# Phase 6-1: 現行 code runner の挙動の棚卸し

Issue #37 の成果物である。Issue #38 (Worker 版 runner, `code-runner-worker.md` に記載) の設計根拠と、#39 (配線) / #40 (`pullVarsFromQuestIdeUserCodeLocalScope`) / Phase 5 (コンテンツ書き換え) の入力になる。アプリケーションの実行時の挙動は変更していない。

- 調査対象: `src/js/app/common/code_runner.js`、`public/code_runner/runner.html`、`public/code_runner/runner.js`、`src/js/app/components/QuestIDE.jsx`、`src/js/app/components/hack_interface/HackInterface.jsx`、`src/js/app/components/hack_interface/validator/{Validator.jsx,ValidationHelper.js}`、`main.js`
- 同梱コンテンツの走査対象: `public/node_modules/twilioquest-*` の `levels/**/objectives/**` 7 パッケージ (api-academy, base, dev-fundamentals, javascript, open-source, python, twilio-vr)
- 実行はしていない。アプリを起動できないため、実行時にしか分からない項目は「未確認」と明記し、10 章に手動確認の手順を置いた。

判定の凡例: **keep** = Worker 版でも同じ契約を維持する、**change** = 契約は維持するが実装または意味が変わる、**drop** = Worker 版では提供しない (コンテンツ側で対応)。

## 1. 構成と実行フロー

3 つのファイルで構成される。

| ファイル | 役割 |
| --- | --- |
| `src/js/app/common/code_runner.js` | メインウィンドウ側。`EventEmitter` を継承したシングルトン (モジュール読み込み時に生成)。 |
| `public/code_runner/runner.html` | 非表示ウィンドウが読み込む HTML。`runner.js` を読むだけ。 |
| `public/code_runner/runner.js` | 非表示ウィンドウ内で動く。console の置き換え、エラー捕捉、ユーザーコードの評価。 |

### 1.1 起動時 (`code_runner.js` のコンストラクタ)

1. `BrowserWindow.getAllWindows()` から、非表示かつ URL が `runner.html` で終わるウィンドウをすべて閉じる (前回の取り残しの掃除)。
2. `new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true }, parent: remote.getCurrentWindow() })` を作る。`parent` を指定するため、ゲームのウィンドウを閉じると一緒に閉じる。`enableRemoteModule` と `contextIsolation` は指定していない。
3. `loadFile(staticFilePath('code_runner/runner.html'))`。
4. `did-finish-load` のたびに `webContents.send('runWithEnv', { env: this.env, appCodePath })` を送る。初回は `this.env === null` なので `runner.js` 側が何もしない。
5. `ipcRenderer.on('code_runner:log', (event, payload) => this.emit('log', payload))` で、ログを `log` イベントに変換する。

### 1.2 実行 (`runCode(code, env)`)

1. `this.env = env` を保存する。
2. `jetpack.writeAsync(`${userData}/QuestIDE/script.js`, code)` でコードを書き出す (`getUserDataPath()` + `/QuestIDE/script.js`)。
3. `codeWindow.webContents.reload()`。リロードが終わると `did-finish-load` が発火し、手順 1.1-4 の `runWithEnv` が送られる。
4. `runner.js` が `runWithEnv` を受けて、ファイルを同期 (`require('fs-jetpack').read`) で読み、評価する。
5. 書き出しまたはリロードが失敗したら、`console.error` に出した上で `console.error` という名前のイベントに `e.message` を載せて emit する。このイベントを購読している箇所は無い (`QuestIDE.jsx` は `log` だけ購読)。結果として、書き出し失敗はユーザーに表示されない。

`runCode` は `Promise` を返さない (内部の async 関数は待たれない)。呼び出し側は完了も失敗も受け取れない。

### 1.3 終了 (`terminate()`)

`this.runCode('console.log("Terminated.")', {})` を呼ぶだけである。つまり「ダミーコードを書いてウィンドウをリロードする」ことで、実行中のコードを止める。結果として次のようになる。

- ウィンドウがリロードされる際に、そのページ内のタイマー、未解決の Promise、ページ内のイベントハンドラは破棄される。
- ダミーコードが動き、`Terminated.` が `log` イベントとして QuestIDE に流れる。常にこの 1 行が出る (何も実行していなくても出る)。
- リロードは非同期で、同期的な保証はない。`terminate()` が返った時点では、まだ止まっていない。
- 同期の無限ループがウィンドウ内で動いている場合に、リロードが割り込めるかどうかは **未確認**。
- Node のハンドル (`http.createServer().listen()` で開いたソケットなど) がリロードで閉じるかどうかは **未確認**。リロードで Node 環境が作り直される場合は閉じるが、実機で確認していない。
- `runCode` を続けて呼ぶと、書き出し (非同期) とリロードが交錯する。書き出しの完了順で、どちらかのコードが残る。run ID は無く、古い実行の出力を区別する手段は無い。

`terminate()` を呼ぶのは `HackInterface.jsx:136` の `close()` だけである (ハックインターフェースを閉じるとき)。

## 2. 利用側

| 呼び出し元 | 使い方 |
| --- | --- |
| `QuestIDE.jsx:40, 53` | `codeRunner.on('log', this.consoleLog)` / `off`。 |
| `QuestIDE.jsx:159` | `codeRunner.runCode(editor.getValue(), env)`。`env` は `getContext('env')` の `{ name: entry.value }` への変換 (値の型は実行時のコンテキスト次第で、文字列とは限らない)。戻り値は使わない。 |
| `HackInterface.jsx:136` | `codeRunner.terminate()`。 |
| `Validator.jsx` / `ValidationHelper.js` | **runner を使わない。** `Validator.jsx` に `codeRunner` への参照は無い。`ValidationHelper` は保存済みコード (`user_code.js`) を読み、自前の `vm` で再実行する (`evalQuestIdeUserCode` は `eval`、`pullVarsFromQuestIdeUserCodeLocalScope` は `vm.Script.runInNewContext`)。これは runner とは別の実行経路で、#40 / #26 で扱う。 |
| `window.reloadExternalModules` | runner とは無関係である (`assetLoader.js:232` のモジュールキャッシュ破棄フラグ。`docs/migration/module-loader-usage.md` 参照)。runner はこのフラグを読まない。 |

`QuestIDE.jsx` の `consoleLog` (`:100-138`) が `log` イベントの引数をどう描画するか。

| 引数 | 描画 |
| --- | --- |
| 文字列 | そのまま 1 行 (空文字列も) |
| `arg.message` と (`arg.stack` または `arg.reason`) を持つオブジェクト | `message` を 1 行。続いて `stack` を行ごとに加工して 1 行にまとめる。`SyntaxError` を含む行で打ち切り、`node_modules` を含む行はパス部分を削り、`at script.js` を含む行 (`indexOf(...) > 0`) の次で打ち切る。 |
| その他の真値 | `JSON.stringify(arg, null, 2)` |
| 偽値 (`0`, `false`, `null`, `undefined`, `NaN`) | **何も表示しない** (現行の仕様。`console.log(0)` は画面に出ない) |

`logLevel` は CSS クラス名 (`log` / `info` / `warn` / `error`) としてそのまま使われる。`stdout` はデフォルト値 (初期メッセージ用)。

## 3. 項目別の挙動と判定

| # | 項目 | 現行の挙動 | 判定 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | 実行基盤 | 非表示 `BrowserWindow` + `nodeIntegration: true` | drop | Node も Electron も無い。Worker (`public/code_runner/worker.js`) に置き換える。 |
| 2 | コードの受け渡し | `userData/QuestIDE/script.js` に書き出し、リロード後に同期で読む | drop | Worker は `postMessage({ type: 'run', code, env })` で直接受ける。ファイル I/O は不要になる (`user_code.js` の保存は QuestIDE 側が別途行う)。 |
| 3 | 評価方式 | `require('vm').runInThisContext(prelude + code, { filename: 'script.js' })` | change | `vm` は使えない。Worker では間接 eval (`(0, eval)(code + '\n//# sourceURL=script.js')`)。グローバルスクリプトとして動く点とスタックに `script.js` が出る点は維持する。 |
| 4 | 実行のたびの初期化 | ウィンドウのリロード。グローバル状態、タイマーは全部消える | keep | Worker を実行ごとに作り直す。 |
| 5 | 古い実行の混入 | 防止策なし (run ID なし) | change | 古い Worker は `terminate()` して、そこからのメッセージを同一性チェックで破棄する。 |
| 6 | `terminate()` | ダミーコードを書いてリロード。非同期。`Terminated.` を常に表示 | change | `worker.terminate()` は同期的で、同期の無限ループも止める。`Terminated.` は常に出す (契約維持)。 |
| 7 | console 転送 | `console.log/info/warn/error` を置き換え、元の関数を先に呼んでから IPC 送信 | keep | Worker でも同じ。引数のシリアライズが変わる (4 章)。 |
| 8 | 他の console メソッド (`debug`, `table`, `dir`, `trace`, `group`, ...) | 置き換えない。元の console にだけ出て QuestIDE には出ない | keep | 動作を変えない。要望が出たら別途。 |
| 9 | 送信先 | `BrowserWindow.getAllWindows()` の全ウィンドウへ `code_runner:log` を送る | drop | `postMessage` はホストにだけ届く。 |
| 10 | 未捕捉例外 | `process.on('uncaughtException')` | change | Worker では `self` の `error` イベント。 |
| 11 | `window.addEventListener('onerror', ...)` | イベント名が誤り (正しくは `error`)。このハンドラは実際には呼ばれない | change | Worker では正しい `error` を購読する。 |
| 12 | 未処理の Promise 拒否 | `window.addEventListener('unhandledrejection', ...)` | keep | Worker でも `unhandledrejection` を購読する。 |
| 13 | env | `Object.assign(process.env, env)` で Node の `process.env` にマージ。リロードをまたいで残る可能性がある (未確認) | change | Worker には Node の `process` が無い。`process = { env }` の最小 shim を定義する (毎回新しい Worker なので、マージではなく置き換え)。 |
| 14 | `require` の公開 | `Object.assign(global, { require })` でランナーウィンドウの `require` を公開 | drop | Worker に `require` は無い。使うコンテンツは 6 章の方針で書き換える。呼ぶと `ReferenceError: require is not defined` として表示される (明示的に失敗)。 |
| 15 | `String.prototype.replaceAll` ポリフィル | 無ければ定義 (引数の文字列を正規表現として使う。エスケープしない) | keep (ただし修正) | Electron 11 (Chromium 87) と Tauri の webview には既にあるので通常は不要。無い環境のために Worker 側にも残す。文字列は正規表現として解釈せずリテラルとして扱う (ネイティブと同じ挙動)。 |
| 16 | `fetchOverride` (divination のフェイク) | `fetch` を置き換え。`https://twilio.com/quest/magic/divination?target=lovelace_secret_statue` だけを偽装する | drop (本タスクでは移植しない) | サーバー側の不具合の回避策で、`api-05-get-patch` 専用。`ValidationHelper.fetchOverride` にも同じ実装があり、そちらは Worker とは別に残る。移植するかは #39 / #40 で決める (7 章)。 |
| 17 | スコープ汚染 | プレリュードが `fetchOverride`、`originalFetch` をグローバルスコープに出す。ユーザーコードが同名で宣言すると `SyntaxError` (`const originalFetch` の再宣言) になりうる | drop | Worker にプレリュードは無い (`fetch` はそのまま)。 |
| 18 | スタックの行番号 | プレリュード (約 150 行) がユーザーコードの前に付くため、`script.js` の行番号はずれる | change | Worker はプレリュードを別に実行する。行番号がエディタの行と一致するようになる。 |
| 19 | 同期エラー | `console.error('There was a problem executing your code:', { message, stack })` | keep | 文言と形を維持する。`null` / `undefined` を `throw` しても落ちないようにする。 |
| 20 | 起動失敗 / 書き出し失敗 | `console.error` のみ (`console.error` イベントは誰も購読しない) | change | Worker の `error` / `messageerror` を `log` (error) として明示的に通知する。 |
| 21 | 起動時の掃除 | 前回のランナーウィンドウを閉じる | drop | Worker は親が消えれば消える。 |
| 22 | 完了通知 / 戻り値 | 無い | keep | 追加しない。 |
| 23 | 実行時の入力 (`process.stdin`, `readline`) | 提供しない (ウィンドウに TTY は無い)。同梱コンテンツでも使っていない | keep | 対応しない。 |

## 4. console 引数のシリアライズ

### 4.1 現行 (IPC)

`___cr___.log(logLevel, args)` は `Array.prototype.slice.call(arguments)` を `webContents.send('code_runner:log', { logLevel, arguments })` に渡す。Electron 11 の `webContents.send` は引数を Structured Clone Algorithm でシリアライズする (`electron.d.ts` の記載による)。したがって次のようになる (コードと型定義による推論。**実行して確認していない**)。

| 値 | 現行の結果 |
| --- | --- |
| プリミティブ、プレーンオブジェクト、配列、`Date`、`Map`、`Set` | そのまま届く |
| `Error` | メッセージとスタックを保ったまま届く想定。QuestIDE の「エラーらしい形」判定 (`message` と `stack`) に合う |
| 関数、`Symbol`、DOM ノード、`Promise` | クローンできず、`webContents.send` が例外を投げる。`console.log` の置き換え関数の中で投げるので、**ユーザーコードの `console.log(fn)` が例外で落ちる** |
| 循環参照 | structured clone は循環を扱えるので届く。QuestIDE が `JSON.stringify` で `TypeError` を出す (描画側の失敗) |

### 4.2 Worker 版で定義したシリアライズ

Worker の `postMessage` も structured clone で、同じ制約がある。さらに、失敗を「ユーザーコードの例外」にしないため、Worker 側で JSON に近い素朴な木に変換してから送る (`worker.js` の `serialize`)。

| 値 | 送る値 |
| --- | --- |
| `string` / `number` / `boolean` / `null` / `undefined` | そのまま |
| `bigint` | `"123n"` |
| `symbol` | `"Symbol(desc)"` |
| 関数 | `"[Function: name]"` / `"[Function (anonymous)]"` |
| `Error` | `{ message, stack }` (スタックの `eval` フレームを `at script.js:L:C` に直し、ランナー内部のフレームを除く) |
| `Date` / `RegExp` | ISO 文字列 / `"/a/g"` |
| `Map` | `[key, value]` の配列 |
| `Set`、型付き配列 | 値の配列 |
| `ArrayBuffer` | `"[ArrayBuffer: N bytes]"` |
| 配列 | 各要素を変換した配列 |
| その他のオブジェクト | 自分の列挙可能な文字列キーのプロパティだけを持つプレーンオブジェクト |
| 祖先に現れるオブジェクト | `"[Circular]"` |
| 深さ 20 を超える入れ子 | `"[Max depth exceeded]"` |
| getter が例外 | `"[Getter threw: message]"` |

判定: **change**。現行は「送れない値でユーザーコードが落ちる」が、Worker 版は「文字列に落として表示する」。これは見た目の動作を変える (落ちなくなる) が、現行の失敗は意図した仕様ではないと判断した。QuestIDE の描画ロジックはそのまま使える (`message` + `stack` のオブジェクトはエラー扱いになる)。

## 5. エラーの扱い

| 種別 | 現行 | Worker 版 |
| --- | --- | --- |
| ユーザーコードの同期例外 | `try/catch` で捕まえ、`console.error('There was a problem executing your code:', { message: e.message, stack: e.stack })` | 同じ文言と形。`message` は `e.message`、無ければ `String(e)` |
| 構文エラー | 同上 (`vm.runInThisContext` が投げる) | 同上 (`eval` が投げる)。QuestIDE が `SyntaxError` を含む行でスタックを打ち切る |
| 非同期の未捕捉例外 | `process.on('uncaughtException')` | `self` の `error` |
| 未処理の Promise 拒否 | `unhandledrejection` (`e.reason` を使う) | 同じ |
| 正規化 | `message` が無ければ、文字列ならそれ、そうでなければ `'Uncaught exception encountered - check your async code.'`。`stack` は `e.stack` か `''`。`console.error({ message, stack })` で出す | 同じ。`null` / `undefined` が来ても落ちない |
| 二重通知 | `onerror` が誤登録のため、画面に出る経路は実質 `uncaughtException` と `unhandledrejection` | `preventDefault()` を呼び、ホストの `Worker.onerror` への二重通知を避ける |

## 6. Node モジュールの必要性と Worker で出来ること

### 6.1 現行の到達範囲

ユーザーコードは、ランナーウィンドウの `require` をグローバルに受け取る (項目 14)。`require` の起点は `public/code_runner/runner.js` なので、次のすべてに到達できる。

- Node の組み込みモジュール全部 (`fs`, `path`, `os`, `readline`, `child_process`, `http`, `https`, `net`, `crypto`, `events`, `util`, `assert`, `vm`, ...)。サンドボックスは無い。
- `public/node_modules` のパッケージ。同梱コンテンツから使われているのは `twilio`、`express`、`body-parser` (`public/package.json` の `dependencies`)。ほか `axios`、`got`、`command-exists` などもインストールされている。
- `require('electron')` (`remote` を含む) にも到達する。コンテンツは使っていない。

### 6.2 同梱コンテンツの実測 (QuestIDE を使う目標)

QuestIDE の対象は、`example.js` を持つ目標である。全 125 目標のうち 64 目標が `example.js` を持つ。うち 25 目標は `example.js` が空で (open-source と programmable_voice の大半。ターミナルで行う作業)、39 目標がコードを持つ。ミッション別は次のとおり。

| パッケージ / ミッション | `example.js` を持つ目標 | うち中身あり |
| --- | --- | --- |
| api-academy / api_academy | 3 | 1 |
| api-academy / lovelace_tower | 5 | 5 |
| base / challenge-questions | 11 | 11 |
| javascript / javascript | 13 | 13 |
| open-source / open_source | 14 | 2 |
| twilio-vr / programmable_voice | 13 | 2 |
| twilio-vr / twilio_messaging | 5 | 5 |

`example.js`、`walkthrough.md`、`description.md` で学習者に使わせるモジュールを数えた (`require('x')` の呼び出しと、グローバルの使用)。件数は目標の数で、同じ目標が複数のファイルに出る場合も 1 と数える。

| モジュール / API | 目標数 | ミッション | 出現箇所 | Worker で可能か | Phase 5/6 でやること |
| --- | --- | --- | --- | --- | --- |
| `fs` (`require("fs").promises` の `readdir`) | 1 (`api-02-async-await`) | api-academy / lovelace_tower | example 1、walkthrough 1 (6 行) | 不可 (ファイルシステムが無い) | 実ファイルを読ませる課題なので Worker のままでは動かない。ホストが提供するヘルパー API (読み取り専用の `readdir` など) を `postMessage` 経由で公開するか、仮想ファイルシステム (メモリ上の固定ツリー) を使う課題に書き換える。バリデータ (`api-02` の `pullVars...`) はユーザーの関数を `fs` 付きで呼ぶので、そちらも仮想 FS に合わせる。 |
| `http` | 5 (`voice7`, `voice10`, `sms1`, `sms3`, `sms8`) | twilio-vr / programmable_voice, twilio_messaging | example 5 (walkthrough にも `sms1`) | 不可 (サーバーソケットを開けない) | Webhook を受ける HTTP サーバーを立てる課題で、Worker では実行できない。ホスト (Tauri 側) のサイドカー / コマンドで実行するか、課題を「ハンドラ関数を書き、ホストが擬似リクエストで呼ぶ」形式に書き換える。無理なら削除。 |
| `express` | 5 (同上) | 同上 | example 5、walkthrough 1 | 不可 (npm パッケージで Node の `http` が前提。Worker に持ち込めない) | `http` と同様。 |
| `body-parser` | 5 (同上) | 同上 | example 5、walkthrough 1 | 不可 (同上) | 同上。 |
| `twilio` (SDK) | 3 (`sms0`, `sms2`, `sms8`) | twilio-vr / twilio_messaging | example 2 (`sms0`, `sms2`)、walkthrough 1 (`sms8`) | ほぼ不可 (SDK は Node の `https` を使う。Twilio の REST API は CORS を許可しないので、ブラウザの `fetch` から呼べない) | 実際に SMS を送る課題。ホスト側の HTTP クライアント (Tauri の http プラグイン等) 経由で公開するか、課題を削除する。Phase 4 で Twilio 系ヘルパーを削除済みの方針と整合させる。 |
| `process.env` (グローバル) | 2 (`sms0`, `sms2`) | twilio-vr / twilio_messaging | example 2 (`TQ_TWILIO_ACCOUNT_SID`, `TQ_TWILIO_AUTH_TOKEN`, `TQ_TWILIO_NUMBER`) | 可 (Worker 版の `process.env` shim) | 変更不要。`runCode` の `env` 引数 (文字列のみ) で渡す。 |
| `fetch` (グローバル) | 3 (`api-03-fetch`, `api-04-remote-and-local`, `api-05-get-patch`) | api-academy / lovelace_tower | description 3、walkthrough 2、example 1 (open-source の `fetch` は `git fetch` の話で、無関係) | 可 (Worker にも `fetch` がある)。ただし CORS の制約を受ける (Node の `fetch` / `https` と違い、相手が CORS を許可する必要がある)。`api-05` では divination のフェイクが必要 | `twilio.com/quest/magic/...` が CORS を許可するか要確認 (未確認)。許可しないなら、ホスト経由のプロキシ、またはフェイクを Worker に組み込む (項目 16)。 |
| `URL` / `new URL(...)` (グローバル) | 1 (`03-debugging-3`) | base / challenge-questions | example 1 | 可 (Worker に `URL` がある) | 変更不要。 |
| `Buffer` (グローバル) | 2 (`07_sync_master`, `08_push_upstream`) | open-source | example 2 (`Buffer.from(s, 'base64').toString('ascii')` で base64 を復号するだけ) | 不可 (Worker に `Buffer` は無い) | `atob(ENCODED_MESSAGE)` に書き換える (Worker にも `atob` がある)。 |
| `module.exports` | 2 (`js_node_env_setup`, `js_node_workspace`) | javascript / javascript | example 2 (`module.exports = function() {...}` の雛形) | 不可 (`module` が無い。ReferenceError になる) | 関数を `module.exports` に代入させる形をやめ、トップレベルの関数宣言にして、バリデータが `pullVars...` の `keys` で取り出す形にする (#40)。 |
| `readline` / `process.stdin` / `child_process` / `os` / `crypto` / `dotenv` / `https` / `events` / `util` / `assert` | 0 | - | 学習者向けのコード (`example.js`、`walkthrough.md`、`description.md`) には出てこない | - | 現状のコンテンツでは必要ない。`child_process`、`os`、`path`、`fs-jetpack` はバリデータ (ホスト側、`helper.fs` / `helper.exec`) だけで使われ、学習者のコードには出ない。 |
| `async` / `await`、`setTimeout`、`console.*`、`Promise` | 多数 | 全般 | - | 可 | 変更不要。 |

バリデータ側 (ホストで動き、Worker とは別) は参考として次のとおり。`pullVarsFromQuestIdeUserCodeLocalScope` を呼ぶのは 14 目標 (api-academy 4、base 10)。これらはユーザーコードを `require` と `process` と `window` と `fetch` (フェイク付き) をコンテキストに入れた `vm` で動かす。ユーザーコードが `require` するのは `api-02` の `fs` だけである。

| バリデータが `require` するもの | 目標数 |
| --- | --- |
| `path` | 46 |
| `fs-jetpack` | 38 |
| `../../../../scripts/objectiveValidation` (内部ヘルパー) | 34 |
| `assert` | 16 |
| `vm` | 15 |
| `fs` | 7 |
| `got` | 7 |
| `twilio` | 5 |
| `child_process` | 5 |
| `lodash.isequal`、`../../../../scripts/config` | 各 3 |
| `../../validation` | 3 |
| `util` | 2 |
| `command-exists` | 1 |

これらは `moduleAllowlist.js` / `ValidationHelper` の範囲 (Phase 3 / 4) の課題で、runner の Worker 化とは独立である。

### 6.3 Worker が提供するもの

| 機能 | Worker | 備考 |
| --- | --- | --- |
| `fetch`、`Headers`、`Request`、`Response`、`AbortController` | 可 | CORS 制約あり |
| `URL`、`URLSearchParams` | 可 | |
| `TextEncoder` / `TextDecoder` | 可 | `Buffer` の代わり |
| `crypto.subtle`、`crypto.getRandomValues`、`crypto.randomUUID` | 可 (secure context のみ。`file:` と Tauri の asset プロトコルでの可否は未確認) | Node の `crypto` とは別物 |
| `structuredClone` | 新しい Chromium と webview のみ (Electron 11 / Chromium 87 には無い) | |
| `setTimeout`、`setInterval`、`queueMicrotask` | 可 | |
| `atob`、`btoa`、`Blob`、`FileReader`、`IndexedDB`、`WebSocket` | 可 | |
| `importScripts` | 可 | 使わない |
| `require`、`module`、`exports`、`__dirname` | 不可 | |
| `process` (Node) | 不可 | `process.env` だけ shim を提供 |
| `Buffer`、`fs`、`path`、`os`、`child_process`、`http`、`net`、`readline` | 不可 | |
| `window`、`document` | 不可 | |

## 7. Worker 化で決めておくべきこと (#39 以降)

1. **`fetchOverride` を移すか。** `api-05-get-patch` の学習者コードは `fetch` を呼ぶ。Worker で動かすとフェイクが効かず、実際のサーバーにアクセスする。フェイクを Worker に組み込む、または Phase 5 でコンテンツ側から divination エンドポイントを外すかを決める。
2. **`window.fetch` へのアクセス。** 現行のユーザーコードは `window.fetch` も使える (`window` がある)。Worker の `self.fetch` で足りる。
3. **`require` を使うコンテンツの扱い。** 6 章の表の「不可」の行 (`fs`、`http` / `express` / `body-parser`、`twilio`、`Buffer`、`module.exports`) が対象。コードを持つ 39 目標のうち 12 目標が影響を受ける (`api-02-async-await`、`voice7`、`voice10`、`sms0`、`sms1`、`sms2`、`sms3`、`sms8`、`07_sync_master`、`08_push_upstream`、`js_node_env_setup`、`js_node_workspace`)。残り 27 目標は、標準の JavaScript と `fetch` / `URL` / `process.env` だけを使うので、そのまま動くはずである (`api-05` の `fetchOverride` を除く)。
4. **`terminate()` の意味の変更。** 現行は非同期だったが、Worker では同期になる。`Terminated.` の表示タイミングが早くなる。
5. **`console.log(0)` などが表示されない件。** QuestIDE の描画側の仕様で、runner の問題ではない (2 章)。変更するかは別途判断する。
6. **ホストの CSP。** 現行のテンプレートには CSP が無い。Tauri で CSP を有効にする場合、`worker-src` (`file:` / asset プロトコル) と、Worker 内の `eval` を許可する `script-src 'unsafe-eval'` が必要になる。

## 8. 観察した疑わしい挙動 (修正はしていない)

- `window.addEventListener('onerror', ...)` は誤ったイベント名で、実際には何も捕まえない (項目 11)。
- `code_runner.js` が書き出し失敗時に emit する `console.error` イベントは誰も購読しない (項目 20)。
- `runner.js` の `log()` は `require('electron').remote.BrowserWindow` に依存する。ランナーウィンドウは `enableRemoteModule` を指定しておらず、Electron 11 の既定は `false` である (`electron.d.ts`)。そのため `remote` が使えるのか、ログ転送が動いているのかを、コードだけでは確かめられない。**未確認**。実機で動いている (ゲームは動作中という前提) なら、Electron 側の仕様でウィンドウ間に継承される可能性がある。確認手順は 10 章。Worker 版はこの依存を持たない。
- `remote.getCurrentWindow()` の `parent` 指定と `BrowserWindow.getAllWindows()` へのブロードキャストは、ランナーウィンドウ自身にも `code_runner:log` を送る (受け手は無い)。
- `runner.js` のコメントは「Electron 11 の Node が古く `String.replaceAll` が無い」という理由でポリフィルを入れている。しかし `vm.runInThisContext` はレンダラの V8 (Chromium 87) で動くので、`replaceAll` はネイティブにあるはずである (Chrome 85 以降。実機では未確認)。ポリフィルは `if (!String.prototype.replaceAll)` で守られており、実質的に何もしない。

## 9. Worker 版の対応表

実装は `public/code_runner/worker.js` と `src/js/app/common/codeRunnerWorker.js` にある。プロトコルは `code-runner-worker.md` を参照。

| 現行 | Worker 版 |
| --- | --- |
| `codeRunner.runCode(code, env)` | `runner.runCode(code, env)` (同じ。`env` を文字列のみに制限し、違反は `TypeError`) |
| `codeRunner.terminate()` | `runner.terminate()` (同じ。常に `Terminated.` を出す) |
| `codeRunner.on('log', ({ logLevel, arguments }) => ...)` | 同じ |
| IPC `runWithEnv` / `code_runner:log` | `postMessage` の `run` / `log` |
| `script.js` への書き出し | 無し |
| `fetchOverride`、`require`、`Object.assign(process.env, env)` | 無し (3 章の判定を参照) |

## 10. 手動確認 (ユーザーが実施。このタスクでは実行できない)

現行の挙動を実機で確かめる場合の手順である。

1. `npm start` でゲームを起動し、QuestIDE を開く目標 (例: `javascript` ミッションの `fizzBuzz`) を開く。
2. `console.log('hi')` を実行し、`hi` が出る (=ログ転送が動く)。`remote` の件 (8 章) の確認になる。
3. `console.log(function(){})` を実行し、画面に何が出るか (例外が出るか) を確認する (4.1 章の推論の確認)。
4. `while (true) {}` を実行し、QuestIDE を閉じる (または再実行する) と止まるか。ハックインターフェースを閉じた時に `Terminated.` が出るか (1.3 章)。
5. `http.createServer().listen(3000)` を実行し、`terminate` 後にポートが解放されるか (`lsof -i :3000`)。
6. `throw null` と `Promise.reject(new Error('x'))` のそれぞれで、画面にどう出るか。
7. `console.log(0)`、`console.log(false)` が何も出ないことの確認 (2 章)。
