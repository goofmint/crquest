# Phase 4-4 / 4-5 / 6-3 / 6-4: Worker 版 runner の配線と ValidationHelper

Issue #39 (`code_runner.js` の Worker 化)、#26 / #40 (`pullVars` の `vm` 非依存化)、#27 (`evalQuestIdeUserCode`) の状況と決定事項である。Worker 本体の仕様は `code-runner-worker.md` を参照。

## 状況

| 項目 | 状況 |
| --- | --- |
| #39 runner の差し替え | 完了 |
| #27 `evalQuestIdeUserCode` | 削除済み (完了) |
| #26 / #40 `pullVars` の Worker 化 | **完了 (3 段階)**。1 段目で「テストケースを Worker 内で実行してデータだけ返す」API (`evaluateInUserCodeLocalScope`) を追加し `twilioquest-javascript` の 10 件を、2 段目で `twilioquest-base` の 10 件と `twilioquest-javascript` の 2 件を、3 段目で `twilioquest-api-academy` の 4 件 (`fetch` / `fs` のモック付き) を載せ替えた (合計 26 件)。`pullVars*` は Worker の `pull` に接続し、`ValidationHelper` から `vm` と `fetchOverride` を削除した (3 章末、4 章) |

## 1. #39: code_runner.js の差し替え (完了)

- `src/js/app/common/code_runner.js` は `createCodeRunnerWorker({ workerUrl: staticFileUrl(WORKER_RELATIVE_PATH) })` のシングルトン。`BrowserWindow` / `ipcRenderer` / `remote` / `fs-jetpack` は使わない。公開面 (`runCode`, `terminate`, `log`) は不変。
- `public/code_runner/worker.js` はコミット済みの静的ファイルで、Vite のバンドル対象ではない (`publicDir: false`)。`staticFileUrl('code_runner/worker.js')` の `file:` URL から `new Worker(url)` で作る。
- `QuestIDE.runCode` は `codeRunner.runCode` の同期例外を画面に出す。
- `runner.html` / `runner.js` は未削除。実機の Electron 11 での Worker 起動は未確認 (`code-runner-worker.md` 5 章の手動確認)。

## 2. #27: evalQuestIdeUserCode (完了)

`grep` の結果、定義以外の呼び出しは `src` にも `public/content` にも無い。ホストでの `eval` は Worker 化の方針と Tauri の CSP に反するため**削除**した (テストで不在を確認)。副作用だけが必要なら `pullVarsFromQuestIdeUserCodeLocalScope([], objective, mission)` を使う。

## 3. #26 / #40: テストケースを Worker に渡す API (1 段目 / 2 段目 / 3 段目)

### 方針

関数・クラスを呼ぶバリデータ (実際は `twilioquest-javascript` 12 件、`twilioquest-base` 10 件、`twilioquest-api-academy` 4 件の 26 件) は、ユーザーコードが返した関数・クラスをホストで同期的に呼んで検証している。Worker 境界は structured clone なので関数・クラスは渡せない。そこで逆にして、**テストケース (検証関数) を Worker に渡し、Worker の中でユーザーコードと一緒に実行して、データだけを受け取る**。判定ロジック (どの結果なら合格か) も Worker 内に置き、ホストにはどの失敗か (`outcome`) とメッセージに必要な文字列だけを返す。ユーザーコードは Worker の中でしか実行されない (ホストでは実行しない)。

### API

`ValidationHelper`:

```js
const verdict = await helper.evaluateInUserCodeLocalScope(userCode, testFn, args, mocks);
const verdict = await helper.evaluateInQuestIdeUserCodeLocalScope(testFn, args, objective, mission, mocks);
```

(`mocks` は省略可。3 段目で追加した。後述の「ホストサービスのモック」を参照。)

下の `evaluateInWorker({ workerUrl, code, test, args, env, mocks, timeoutMs, createWorker })` (`src/js/app/common/codeRunnerWorker.js`) を呼ぶだけで、Worker の URL は `staticFileUrl('code_runner/worker.js')`。後者は `pullVarsFromQuestIdeUserCodeLocalScope` と同じく保存済みコードを読んで前者に渡す。

仕様:

- `code` を 1 回実行し、続けて同じスクリプト内で `(testFn)(args)` を呼ぶ。このためユーザーコードの最上位の `var` / `let` / `const` / 関数 / クラスを名前で直接参照できる (`let` / `const` / `class` も見える)。`testFn` は `async` でもよく、返された Promise は待つ。
- `testFn` は `Function.prototype.toString` でソース文字列にして送る (文字列で渡してもよい)。したがって**自己完結**していること: バリデータ側の変数、`helper`、`require`、import は Worker に無い。使うと Worker 内の `ReferenceError` として reject される (`hostVariable is not defined`)。必要なデータは `args` で渡し、補助関数 (`isFunction` など) は `testFn` の中に書く。アロー関数、`function` 式、`async` 関数が使える。オブジェクトのメソッド省略記法 (`{ f() {} }` の `f`) は式として評価できず `SyntaxError` になる。ネイティブ関数・`bind` した関数はホストで `TypeError` にする。
- `args` (既定 `{}`) は JSON 互換のみ (文字列、有限の数値、真偽値、`null`、それらの配列と素のオブジェクト)。`undefined`、`NaN`、関数、`Date`、`Map`、循環参照などは、Worker を起動する前に `args.path.to.value must be JSON compatible (...)` の `TypeError` で reject する。
- 戻り値は structured clone 可能なデータ。関数・クラス・`Symbol`、それらを含むオブジェクトは `The result of the test function (function) cannot be returned ...` で reject (フォールバックなし)。クラスのインスタンスは素のオブジェクトになる。値のまま返さず `${value}` のように文字列にして返すとよい。
- reject する場合 (どれも `name` / `message` / `stack` を保った `Error`):
  - ユーザーコードが例外を投げた、構文エラー (`SyntaxError`)。`testFn` は実行しない。
  - `testFn` が例外を投げた、または Promise が reject された。
  - 結果が clone できない、Worker が失敗した、想定外のメッセージ、10 秒のタイムアウト (無限ループは Worker ごと終了する)。
  - 文字列などを `throw` した場合は `name` が空になり、`String(error)` は従来の `vm` 版と同じく文字列そのまま。
- 環境は `pull` と同じ: `process.env` は空のオブジェクト (`evaluateInWorker` の `env` で文字列を渡せるが、ValidationHelper は渡さない)、`fetch` は Worker 標準のもの (`mocks.fetch` で置き換えられる)、`require` / `window` / `module` は無い (`mocks.fs` があるときだけ `fs` 用の `require` が入る)。コンソール出力は捨てる。
- プロトコルは `code-runner-worker.md` の `evaluate` / `result` / `result-error`。

使用例 (`forEach` の一部):

```js
const tq = await helper.evaluateInUserCodeLocalScope(userCode, () => {
  let target;
  try { target = scan; } catch (error) { return { readError: { name: error.name, text: `${error}` } }; }
  try {
    const result = target(['contraband', 'a']);
    if (result !== 1) return { outcome: 'wrong-value' };
  } catch (ee) { return { outcome: 'call-error', error: `${ee}` }; }
  return { outcome: 'ok' };
});
if (tq.readError) { /* ReferenceError なら「scan が無い」、それ以外は検証エラー */ }
if (tq.outcome === 'wrong-value') return helper.fail(`...`);
```

### 載せ替えた validator (`twilioquest-javascript` の 10 件)

`forEach`, `js_declare_function`, `js_function_arguments`, `loopFilter`, `loopGetIndexes`, `loopMap`, `loopReduce`, `js_split_east_laser`, `js_split_north_laser`, `classes`。

- 判定と失敗メッセージは変更前と同じ。変更前の `pullVars...(userCode, ['name'])` 以降の判定ブロックを、Worker 内の `testFn` (読み出し、型検査、呼び出し、結果の検査をそのまま移したもの) と、`outcome` を変更前と同じメッセージに写すホスト側の `if` に分けた。メッセージの文字列は変更前と一字一句同じ (`${result}` / `${ee}` の埋め込みは Worker から文字列で受け取る)。
- `isFunction` / `isClassDeclaration` (`obj.constructor && obj.call && obj.apply`、`toString().includes('class')`)、`instanceof` 相当の `new`、`function.length` などは、すべて Worker 内の `testFn` で実行されるので、変更前と同じ判定になる。
- `tq._error` (変数の読み出しで投げられた例外) は `readError: { name, text }` で受け取る。`ReferenceError` かどうかは `name` で判定する。
- 挙動の差 (軽微):
  - ユーザーコードの実行は 1 回 (`vm` 版は 2 回)。
  - Worker の最上位は本物のグローバルオブジェクトなので、`Object.defineProperty(globalThis, 'scan', { get() { throw ... } })` のような読み出しの例外は「検証で問題が起きた」になる (`vm` のコンテキストではそもそも読めず `ReferenceError` 扱いだった)。
  - 学習者の関数は `this` が `tq` オブジェクトではなく `undefined` (非 strict ならグローバル) で呼ばれる。
  - 学習者のコードから `require` / `window` / `process` (実環境の) / `fetchOverride` は見えない。これらの課題で使うものは無い。
- データだけを返す `js_declare_variable`, `js_declare_variable_multiple`, `arrays` は載せ替えていない。これらは `pullVarsFromUserCodeLocalScope` のまま (3 段目で `pullVars` を Worker の `pull` に接続すれば、コードの変更なしで動く。値が clone できない場合だけ明示エラーになる)。
- `instantiation` (`tq.construct(...)`) と `js_split_west_laser` (`new tq.Ducktypium(...)`) は 1 段目では漏れていたが、2 段目で載せ替えた (次節)。

### 載せ替えた validator (2 段目: 12 件)

`twilioquest-base` (QuestIDE、`evaluateInQuestIdeUserCodeLocalScope`、保存済みコードは従来どおり `helper.getQuestIdeUserCode` 経由で読む): `sum-array`, `flatten-array`, `reverse-words`, `check-for-palindrome`, `balance-brackets`, `remove-duplicate-characters`, `difference-max-min`, `03-debugging-1`, `03-debugging-2`, `03-debugging-3`。`twilioquest-javascript` (`evaluateInUserCodeLocalScope`): `instantiation`, `js_split_west_laser`。

- `instantiation` と `js_split_west_laser` は 1 段目と同じパターン (`outcome` を返し、ホストが従来と同じメッセージを出す)。
- `twilioquest-base` の 10 件は `assert` を使っていた。Worker には `require` が無いので、`assert(x, message)` / `assert.strictEqual(a, b, message)` は `Object.is` による比較と `throw new Error(message)` に置き換えた (`strictEqual` は `Object.is` 相当)。失敗は Worker 内で投げた `Error` が reject として返り、従来どおり外側の `catch (err) { helper.fail(err); }` が `err.message` を表示する。学習者の関数が投げた例外も同じ経路で、メッセージは従来と同じ。
  - 変数が読み出せない、または偽 (`0`、`''`、`null`) のときは従来どおり `The function X is not defined!` (どんな読み出し例外も無視する)。関数でない値を渡したときの `testFunction is not a function` も、呼び出す関数の仮引数名を従来と同じ `testFunction` にして保っている。
  - `flatten-array` は `helper.areArrayContentsEqual` と `helper.formatByType` を使っていたので Worker 内に同じ実装を置いた。文字列としての比較を先に行う従来の挙動 (要素が違う配列は `One or more array elements ...` で失敗する) も同じ。
  - `03-debugging-1/2/3` は `lodash.isequal` を使っていた。Worker に `require` が無いので、同じ判定 (SameValueZero、ボックス化されたプリミティブ、配列、自身の列挙可能キー (Symbol を含む) とコンストラクタの比較) の `isEqual` を `testFn` 内に置いた。ランダムな値 30 万組 (クラスのインスタンス、`Object.create(null)`、`Number` / `String` / `Date` / `RegExp` / `Map`、`arguments`、`NaN`、`-0` を含む) で `lodash.isequal` と結果が一致することを確認した (循環参照は `JSON.stringify` が先に投げるので比較まで届かない)。
- 変更前後の同一性: 新しいテスト (`src/test/app/content/baseValidators.test.js`、`javascriptFunctionValidators.test.js`) の全ケースを、変更前 (`vm` 版) の実装でも実行して同じ結果になることを確認した。唯一の差は検証に使った Node 26 の `assert.strictEqual` で、カスタムメッセージの後ろに `\n\n<実際> !== <期待>\n` を付ける。Electron 11 の Node 12 では付かない (メッセージのみ) ので、この PR の結果が本来の挙動と一致する。
- 挙動の差 (軽微): 1 段目に挙げたものに加えて、学習者のコードの無限ループは 10 秒で Worker ごと終了し、`Error` として `helper.fail` に渡る (従来はアプリが固まった)。関数が文字列以外の `Error` でない値 (数値やオブジェクト) を投げた場合、表示される `message` は Worker 経由の `Error` のものになり、従来 (`undefined`) とは異なりうる。

### 載せ替えた validator (3 段目: api-academy の 4 件)

`twilioquest-api-academy` の `api-01-local-function`, `api-02-async-await`, `api-04-remote-and-local`, `api-05-get-patch` (`levels/lovelace_tower/objectives/`)。`evaluateInQuestIdeUserCodeLocalScope` を使い、判定と失敗メッセージは変更前と同じ (`assert` は `Object.is` と `throw new Error(message)` に置き換え。2 段目と同じ)。

- `api-01`: 2 段目と同じパターン。
- `api-04`: 本の一覧は従来どおりホストの `fetch(DIVINATION_API_ENDPOINT)` で取り (`console.log(books)` も残した)、`books` を `args` で Worker に渡す。`getAuthorNames` / `areArrayContentsEqual` は Worker 内に複製した。学習者の関数の中の `fetch` は Worker の `fetch` (本物のネットワーク)。従来は学習者の関数が `fetchOverride` 経由で本物の `fetch` を呼んでいたので、挙動は同じ。順序の差: 従来は「関数が未定義」の判定が一覧の取得より先だったが、今は取得が先 (取得に失敗すると、関数が未定義でも取得のエラーが出る)。
- `api-02`: ホストで `helper.fs.readdir(<houses>)` を呼んで一覧を作り (従来どおり)、これを `fs` モックで学習者の `require("fs").promises.readdir` に渡す。
- `api-05`: 偽サーバー (divination の `lovelace_secret_statue` 用の回避策) を `fetch` モックとして学習者のコードに入れる。

### ホストサービスのモック (`mocks`)

学習者のコードが Node のモジュールや偽サーバーを前提にしている課題のために、`evaluate` メッセージに任意の `mocks` を足した (`public/code_runner/worker.js`、`codeRunnerWorker.js`)。**ユーザーコードの実行前に** Worker のグローバルへ入れるので、最上位の文も見える。ここに挙げたもの以外は入れられず、未知のキーは Worker を起動する前にホスト側で `TypeError` にする (フォールバックなし)。

| キー | 渡すもの | 効果 |
| --- | --- | --- |
| `fetch` | 自己完結した**ファクトリ** `realFetch => fetchLike` (関数かそのソース文字列。`test` と同じ制約で、ホストの変数は使えない) | 返された関数を Worker のグローバル `fetch` にする。状態 (偽サーバーが覚えている内容) はファクトリのクロージャに置く。`realFetch` は Worker 本来の `fetch` で、偽装しないリクエストの通過に使う。ファクトリが関数を返さなければ明示エラー。 |
| `fs` | `{ directories: { [path]: string[] } }` (JSON) | 読み取り専用の仮想ファイルシステム。グローバル `require` を入れ、`require('fs').promises.readdir(path)` と `require('fs/promises').readdir(path)` だけを提供する。載っているディレクトリは名前の配列 (コピー) を返し、それ以外のパスは `ENOENT: no such file or directory, scandir '<path>'` (`code: 'ENOENT'`) で reject。`readdir` の第 2 引数 (オプション) と、`fs` / `fs/promises` 以外の `require` (`Cannot find module`、`code: 'MODULE_NOT_FOUND'`) は明示エラー。コールバック版の `readdir` や `readFile` などは無い。 |

`fetch` の設計: データ (URL とメソッドからレスポンスへの対応表) で表せるのは単純な場合だけで、`api-05` の偽サーバーは状態を持ち (PATCH された碑文を GET が検証する)、判定ロジックを含む。対応表を作る代わりに、従来の `ValidationHelper.fetchOverride` の実装をそのままファクトリにした (`this.fakeFetch` はクロージャの変数、`fetch(...arguments)` は `realFetch(...arguments)` に置き換えただけ。判定、メッセージ、`response.json()` / `text()` の形、`init` の既定値も同じ)。ファクトリは `api-05-get-patch/validator.js` に置き、ホスト側の `ValidationHelper.fetchOverride` は不要になったので**削除した** (`api-05` 以外に使う所が無い)。validator のテストケースは、検証の最後に Worker 内の `globalThis.fetch(...?guid=...)` を呼んで、偽サーバーに覚えさせた碑文を確かめる (従来の `helper.fetchOverride(...)` の呼び出しと同じ)。学習者のコードが top-level で `fetch` を呼んでも、従来どおり偽サーバーに届く。

`fs` の設計: `api-02` は課題文と `example.js` が学習者に `const { readdir } = require("fs").promises;` を書かせる。従来はホストの本物の `require` でこれが動いたが、Worker には `require` も `fs` も無い。Worker 側に本物の `fs` は要らず (validator は一覧をホストで読んで渡す)、課題が必要とする `readdir` だけを、検証用ディレクトリの一覧に限って与えた。**学習者がテスト用ディレクトリ以外 (`.` など) を読むと、従来は成功していたものが ENOENT になる。** validator は常にテスト用ディレクトリ (`houses`) を渡すので、課題の合否には影響しない。

### `pullVars*` の Worker 化 (3 段目)

- `pullVarsFromUserCodeLocalScope(userCode, keys)` は `pullVarsInWorker({ workerUrl: staticFileUrl('code_runner/worker.js'), code, keys })` を呼ぶだけになった (`vm` は削除)。`pullVarsFromQuestIdeUserCodeLocalScope` は保存済みコードを読んでこれに渡す (変更なし)。
- 戻り値は従来どおり (`{ [key]: value, _error? }`)。変数の読み出しの例外は `_error` に入り (`ReferenceError` など。それより前に読めた変数は残る)、ユーザーコード自身の例外と構文エラーは reject。
- **関数・クラス・Symbol (およびそれを含むオブジェクト) の変数は取れない。** 構造化クローンできないので、`Variable "name" (function) cannot be returned ...` で reject する。関数を呼ぶ検証は `evaluateIn*` を使う。`pullVars*` を呼ぶ validator は、データだけを読む次の 3 件で全部 (`twilioquest-javascript`: `js_declare_variable`: 文字列、`js_declare_variable_multiple`: 数値・文字列・真偽値、`arrays`: 文字列の配列)。`src/test/app/content/pullVarsUsers.test.js` が `public/content` を走査し、この一覧と要求する変数名が一致すること (新しい利用や関数を要求する変更が来たら失敗すること) を確認する。
- `ValidationHelper` に `vm` は無く、`grep -rn "require('vm')\|from 'vm'" src public/content` の結果はテストコード (`codeRunnerWorkerScript.test.js`: Worker スクリプトを評価する偽スコープ、`moduleLoader` のテストの拒否対象) だけ。**Tauri に Node の `vm` は無いので、この削除が必須の前提だった。**

## 4. 最終状態

### API (`ValidationHelper`)

| メソッド | 用途 |
| --- | --- |
| `evaluateInUserCodeLocalScope(userCode, test, args = {}, mocks?)` | 文字列のコードと検証関数を Worker で実行し、結果 (データ) を返す |
| `evaluateInQuestIdeUserCodeLocalScope(test, args, objective, mission?, mocks?)` | 上と同じで、保存済みの QuestIDE コードを使う |
| `pullVarsFromUserCodeLocalScope(userCode, keys = [])` | データの最上位変数だけを Worker から取る (関数は不可) |
| `pullVarsFromQuestIdeUserCodeLocalScope(keys, objective, mission?)` | 上と同じで、保存済みの QuestIDE コードを使う |
| (削除) `fetchOverride` | 偽サーバーは `mocks.fetch` で `api-05` の validator が持つ |

すべて `src/js/app/common/codeRunnerWorker.js` (`evaluateInWorker` / `pullVarsInWorker`) と `public/code_runner/worker.js` の上に載る。プロトコルは `code-runner-worker.md`。

### 従来との挙動の差 (Electron でも変わるもの)

- ユーザーコードの実行は 1 回 (`vm` 版は 2 回)。Worker ごとに新しい環境で、10 秒のタイムアウトで Worker ごと終了する (無限ループを書いてもアプリは固まらず、`helper.fail` に `Running the code timed out after 10000 ms` が渡る)。
- ユーザーコードから `require` / `window` / `process` (実物) / `URL` 以外のホストの値 / `module` は見えない (`process.env` は `{}`)。`require` はモックの `fs` があるときだけ、`fs` と `fs/promises` の `readdir` に限り存在する。
- `this`: 学習者の関数は `this === undefined` (非 strict でもグローバルでもなく、検証関数内のプレーンな呼び出し) で呼ばれる。メソッドとして呼ぶ書き方で `this` に頼る学習者のコードは動かない。
- 関数・クラスは `pullVars*` から取れない (上記)。クラスのインスタンスは素のオブジェクトになる。
- `assert.strictEqual` の失敗メッセージは `Expected ...` の本文だけ (Node 26 は差分を後ろに付けるが、Electron 11 の Node 12 は付けない)。
- 学習者の関数が文字列以外の `Error` でない値 (数値やオブジェクト) を投げたときの `message` は、従来 (`undefined`) と異なりうる。
- `api-02`: 上記のとおりテスト用ディレクトリ以外は ENOENT。`api-04`: 「関数が未定義」より先に本の取得が失敗しうる。
- Worker 内の `fetch` はレンダラーの `fetch` ではなく Worker のもの。ネットワークの制限 (CORS、CSP) が Electron 11 の `file:` Worker で想定どおりかは、手動確認が必要。

### QuestIDE (学習者が HACK の前に実行するコード) は別経路

`QuestIDE` の実行 (`code_runner.js`、`run`) の Worker には `mocks` を入れない。そのため、学習者が QuestIDE で試し実行すると、`api-02` の `require("fs")` は `ReferenceError: require is not defined`、`api-05` の `fetch` は偽サーバーではなく本物のサーバー (不具合のある `lovelace_secret_statue`) に届く。**検証 (HACK) は上記のモックで通るが、試し実行では動かない。** 学習者向けの課題を黙って変えないため、本チケットでは直していない (`code-runner-behavior.md` の 7 章、決定が必要)。

### `contentRequires.test.js` と `example.js`

`api-02-async-await/example.js` の `require("fs")` は学習者に見せるコンテンツで、ホストのコードではなく、ゲームも読み込まない。**既知の例外 (`twilioquest-api-academy/.../api-02-async-await/example.js: fs`) として残し**、コメントを実態 (検証 Worker の `fs` モックが `require("fs").promises.readdir` を提供する) に合わせた。例外が消える (例えば課題を書き換える) と、同テストが「例外が不要になった」と失敗するので、そのとき一覧から外す。`vendored` なので `example.js` 自体は変更していない。

### 変換パターン (今後 `pullVars*` を使う validator を足すとき)

1. バリデータを全部読む。`pullVars*` の戻り値 (`tq.xxx`) のうち、関数・クラスとして呼ぶものを洗い出す。データだけなら `pullVars*` のままでよい (`pullVarsUsers.test.js` の一覧に足す)。
2. 変数の読み出し (`try { target = name } catch`)、型検査 (`isFunction` など)、呼び出しと結果の検査を、そのまま 1 つの自己完結した関数にまとめる。ホスト側の変数・補助関数は使わない (補助関数は関数の中に複製する)。判定の順序、`undefined` / `null` の扱い、`isNaN`、`instanceof`、`toString` などの式は変えない。
3. 関数は判定結果を `{ outcome, ...メッセージに必要な文字列 }` で返す (失敗を `throw new Error(message)` にしてもよい)。結果の値は `${value}` で文字列にする。クラスのインスタンスや関数は返さない。期待値が複数のテストで共有されるなら `args` (JSON) で渡す。
4. ホスト側は `outcome` ごとに、変更前と同じメッセージの `helper.fail(...)` を呼ぶ。メッセージは一字一句変えない。
5. ユーザーコードの例外は reject されるので、外側の `catch (e)` の既存メッセージ (`${e}`) をそのまま使う。
6. `fetch` や `fs` が要るなら `mocks` を使う (上記)。それ以外のホスト API は提供しない。
7. テスト: 合格コードと不合格コードを 1 件ずつ以上、各 `outcome`、読み出しエラー、例外を投げるコード、構文エラー、ファイルなしを、実 Worker (`NodeWorker`) で実行する。**同じテストを変更前の (`vm` 版) 実装でも実行して同じ結果になること**を確認する (`src/test/app/content/apiAcademyValidators.test.js` の 74 件は、旧実装でも (`require("os")` が「Cannot find module」になる `api-02` の 1 件を除いて) 同じ結果だった。`strictEqual` のメッセージの差分は正規表現の前方一致で吸収している)。

### 手動で確認すること (パッケージごと。アプリは起動していない)

Electron 11 の実機で、`vm` の削除と Worker の `file:` 起動 (`code-runner-worker.md` 5 章) を確認する。

- `twilioquest-javascript` (データ 3 件: `js_declare_variable`, `js_declare_variable_multiple`, `arrays`): 正解のファイルで成功、値違いで失敗、変数名違いで「定義されていない」、構文エラーのファイルでエラーメッセージ。
- `twilioquest-javascript` (関数・クラス 12 件) と `twilioquest-base` (10 件): 正解と不正解の 1 つずつ。無限ループを書いて HACK して、10 秒でエラーになりアプリが固まらないこと。
- `twilioquest-api-academy` (`lovelace_tower`):
  - `api-01`: `swapStrings` を実装して成功。
  - `api-02`: `const { readdir } = require("fs").promises;` を使った `findLastFileInDir` で HACK して成功 (QuestIDE の試し実行は `require is not defined` になる。上記)。
  - `api-04`: 実際のネットワーク (divination エンドポイント) で成功、機内モードなどで失敗メッセージ。学習者の関数の `fetch` がレンダラーのネットワーク設定で届くこと。
  - `api-05`: GET と PATCH で碑文を直して成功。PATCH を省く、不正な JSON を送る、で従来どおりのメッセージ。
- `twilioquest-dev-fundamentals` / `twilioquest-python` / `twilioquest-open-source`: `pullVars*` も `evaluateIn*` も使わないので影響なし (`pullVarsUsers.test.js`)。
- `owls-nest-extension`: 同上。
