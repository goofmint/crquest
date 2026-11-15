# Phase 4-4 / 4-5 / 6-3 / 6-4: Worker 版 runner の配線と ValidationHelper

Issue #39 (`code_runner.js` の Worker 化)、#26 / #40 (`pullVars` の `vm` 非依存化)、#27 (`evalQuestIdeUserCode`) の状況と決定事項である。Worker 本体の仕様は `code-runner-worker.md` を参照。

## 状況

| 項目 | 状況 |
| --- | --- |
| #39 runner の差し替え | 完了 |
| #27 `evalQuestIdeUserCode` | 削除済み (完了) |
| #26 / #40 `pullVars` の Worker 化 | **段階的に進行中 (3 段階の 2 段目まで完了)**。`pullVars*` は従来どおり `vm` のまま。1 段目で「テストケースを Worker 内で実行してデータだけ返す」API (`evaluateInUserCodeLocalScope`) を追加し、`twilioquest-javascript` の 10 件を載せ替えた。2 段目で `twilioquest-base` の 10 件と `twilioquest-javascript` の `instantiation` / `js_split_west_laser` を載せ替えた (合計 22 件)。残りは 4 章 |

## 1. #39: code_runner.js の差し替え (完了)

- `src/js/app/common/code_runner.js` は `createCodeRunnerWorker({ workerUrl: staticFileUrl(WORKER_RELATIVE_PATH) })` のシングルトン。`BrowserWindow` / `ipcRenderer` / `remote` / `fs-jetpack` は使わない。公開面 (`runCode`, `terminate`, `log`) は不変。
- `public/code_runner/worker.js` はコミット済みの静的ファイルで、Vite のバンドル対象ではない (`publicDir: false`)。`staticFileUrl('code_runner/worker.js')` の `file:` URL から `new Worker(url)` で作る。
- `QuestIDE.runCode` は `codeRunner.runCode` の同期例外を画面に出す。
- `runner.html` / `runner.js` は未削除。実機の Electron 11 での Worker 起動は未確認 (`code-runner-worker.md` 5 章の手動確認)。

## 2. #27: evalQuestIdeUserCode (完了)

`grep` の結果、定義以外の呼び出しは `src` にも `public/content` にも無い。ホストでの `eval` は Worker 化の方針と Tauri の CSP に反するため**削除**した (テストで不在を確認)。副作用だけが必要なら `pullVarsFromQuestIdeUserCodeLocalScope([], objective, mission)` を使う。

## 3. #26 / #40: テストケースを Worker に渡す API (1 段目 / 2 段目)

### 方針

関数・クラスを呼ぶバリデータ (実際は `twilioquest-javascript` 12 件、`twilioquest-base` 10 件、`twilioquest-api-academy` 4 件の 26 件) は、ユーザーコードが返した関数・クラスをホストで同期的に呼んで検証している。Worker 境界は structured clone なので関数・クラスは渡せない。そこで逆にして、**テストケース (検証関数) を Worker に渡し、Worker の中でユーザーコードと一緒に実行して、データだけを受け取る**。判定ロジック (どの結果なら合格か) も Worker 内に置き、ホストにはどの失敗か (`outcome`) とメッセージに必要な文字列だけを返す。ユーザーコードは Worker の中でしか実行されない (ホストでは実行しない)。

### API

`ValidationHelper`:

```js
const verdict = await helper.evaluateInUserCodeLocalScope(userCode, testFn, args);
const verdict = await helper.evaluateInQuestIdeUserCodeLocalScope(testFn, args, objective, mission);
```

下の `evaluateInWorker({ workerUrl, code, test, args, env, timeoutMs, createWorker })` (`src/js/app/common/codeRunnerWorker.js`) を呼ぶだけで、Worker の URL は `staticFileUrl('code_runner/worker.js')`。後者は `pullVarsFromQuestIdeUserCodeLocalScope` と同じく保存済みコードを読んで前者に渡す。

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
- 環境は `pull` と同じ: `process.env` は空のオブジェクト (`evaluateInWorker` の `env` で文字列を渡せるが、ValidationHelper は渡さない)、`fetch` は Worker 標準のもの (`fetchOverride` は使われない)、`require` / `window` / `module` は無い。コンソール出力は捨てる。
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

### 土台として残したもの (未配線)

- `public/code_runner/worker.js` の `pull` メッセージ、`codeRunnerWorker.js` の `pullVarsInWorker` と、そのテスト (単体・実 Worker 統合)。
- 仕様: コードを 1 回だけ実行し、要求した最上位変数を返す。変数読み出しの例外は `_error`、ユーザーコードの例外は reject。`keys` は識別子のみ。10 秒のタイムアウト。値は structured clone 可能なものだけで、関数・クラス・Symbol・それを含むオブジェクトは変数名を示す明示エラーで reject する (フォールバックなし)。`process.env` は空の shim で、`require` / `window` / `fetchOverride` は無い。
- `pullVarsInWorker` と `evaluateInWorker` は、Worker との 1 往復を `exchangeWithWorker` で共有する (挙動は変更なし)。

## 4. 今後 (別途追跡)

### 変換パターン (2 段目・3 段目のチェックリスト)

1. バリデータを全部読む。`pullVars*` の戻り値 (`tq.xxx`) のうち、関数・クラスとして呼ぶものを洗い出す。データだけなら変更不要 (3 段目で `pull` に接続される)。
2. 変数の読み出し (`try { target = name } catch`)、型検査 (`isFunction` など)、呼び出しと結果の検査を、そのまま 1 つの自己完結した関数にまとめる。ホスト側の変数・補助関数は使わない (補助関数は関数の中に複製する)。判定の順序、`undefined` / `null` の扱い、`isNaN`、`instanceof`、`toString` などの式は変えない。
3. 関数は判定結果を `{ outcome, ...メッセージに必要な文字列 }` で返す。結果の値は `${value}` で文字列にする。クラスのインスタンスや関数は返さない。期待値が複数のテストで共有されるなら `args` (JSON) で渡す。
4. ホスト側は `outcome` ごとに、変更前と同じメッセージの `helper.fail(...)` を呼ぶ。メッセージは一字一句変えない。
5. ユーザーコードの例外は reject されるので、外側の `catch (e)` の既存メッセージ (`${e}`) をそのまま使う。
6. テスト: 合格コードと不合格コードを 1 件ずつ以上、各 `outcome`、読み出しエラー、例外を投げるコード、構文エラー、ファイルなしを、実 Worker (`NodeWorker`) で実行する。**同じテストを main (旧 `vm` 実装) でも実行して同じ結果になること**を確認する (`src/test/app/content/javascriptFunctionValidators.test.js` を参照)。

### 残り

- `grep -rn "pullVarsFrom" public/content src` の結果、`pullVars*` を呼ぶのは次のものだけ。
  - データだけを読むもの (3 段目で `pull` に接続する。コード変更は不要): `twilioquest-javascript` の `js_declare_variable`, `js_declare_variable_multiple`, `arrays`。
  - 3 段目で載せ替える `twilioquest-api-academy` の `api-01-local-function`, `api-02-async-await`, `api-04-remote-and-local`, `api-05-get-patch`。非同期 (`await`) と `fetch` を使う。Worker 内の `fetch` は標準のもので `fetchOverride` (`api-05-get-patch` の偽サーバー) が効かないため、偽 `fetch` を `testFn` の中で再現するか、`env` / `args` で渡す設計が必要。`QuestIDE` のユーザーコードが `fs` / `Buffer` / `http` を使う場合 (下記) も同様に未解決。
  - `ValidationHelper` 自身 (定義と `pullVarsFromQuestIdeUserCodeLocalScope` から `pullVarsFromUserCodeLocalScope` への委譲)。
- 3 段目: api-academy を載せ替えたら `ValidationHelper` の `pullVars*` を `pullVarsInWorker` に接続し、`vm` を削除する。**Tauri 化の前に `vm` は必ず外す** (Tauri に Node の `vm` は無い)。それまでは Electron の挙動を変えない。

### QuestIDE のユーザーコードが `fs` / `Buffer` / `http` を使う場合 (範囲外)

Worker には `require`、`fs`、`Buffer`、`http` が無く、`ReferenceError: require is not defined` になる。ホスト API の公開などはここでは設計しない (Phase 5 / 6 の残課題)。
