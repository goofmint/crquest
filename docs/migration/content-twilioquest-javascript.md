# Phase 5 / 5d: twilioquest-javascript の取り込みと Node 専用 API・Twilio 依存の除去

Issue #32。`twilioquest-javascript@1.1.7` (`public/package-lock.json` が解決していたバージョン。`integrity` の sha512 が `npm pack` の tarball と一致することを確認済み) を `public/content/twilioquest-javascript/` に取り込んだ (273 ファイル。`LICENSE`、`README.md`、`package.json` を保持)。取り込み方式は `content-layout.md` に従う。

コミットは 2 つに分けている。1 つ目 (`Vendor twilioquest-javascript 1.1.7 content (unmodified)`) は tarball と完全に同一のファイルだけ、2 つ目に書き換え・テスト・設定・本ドキュメントを入れた。上流との差分は 2 つ目のコミットで見える。

## 1. 取り込みに伴う設定変更

- `src/js/app/config/vendoredExtensionModules.json` に `twilioquest-javascript` を追加。
- `public/package.json`: `twilioquest-javascript` を削除。
- `public/package-lock.json` (lockfileVersion 1): `twilioquest-javascript` のエントリ (ネストした `command-exists@1.2.9`、`fs-jetpack@4.3.1`、`uuid@8.3.2` を含む 33 行) を手で削除した。
- 実行時に使う bare モジュールは `path`、`uuid` (`scripts/objectiveValidation.js` の `{ v4 }`) の 2 つで、どちらも許可リストにある。`uuid` は最上位の `uuid@3.3.2` (`public/package.json` の直接の依存) に解決される。`uuid@3` は `require('uuid').v4` を持つので、上流が使っていた `uuid@8` と同じ書き方で動く。このため `public/package.json` への依存の追加は不要だった。

## 2. 実行時に読み込まれる JS の `require` の洗い出し

入口 (`objects/*/config.js`、`levels/*/events.js`、`levels/**/validator.js`) とそこから到達する `scripts/` を走査した。`levels/javascript/events.js`、`events/*.js`、`objects/*`、`scripts/{conversationOnInteract,createPylonConfig,objectiveCompletionResponder,config}.js` は相対 `require` のみで、変更していない。許可リスト外のものは次のとおり。

| 対象 | 許可リスト外の require | 対応 |
| --- | --- | --- |
| validator 25 件 | `fs-jetpack` (existsAsync / readAsync) | `helper.fs.existsAsync` / `helper.fs.readAsync` |
| validator 15 件 | `vm` | `helper.pullVarsFromUserCodeLocalScope` (3.1 節) |
| `scripts/objectiveValidation.js` (8 件の validator と `arrays2` / `arrayFunctions` が使う) | `child_process` (`spawn`)、`electron` (`remote`)、`fs-jetpack`、`esprima` | 3.2 節 |
| `js_node_env_setup` | `child_process` (`spawn`) | `helper.exec` |
| `create_repo` | `command-exists`、`child_process` (`exec`)、`util`、`fs-jetpack` | `helper.commandExists`、`helper.exec`、`helper.fs` |
| `green-keycard` | `twilio` (未使用) | 4 節 |

## 3. 書き換え

判定、メッセージ、報酬、目標名、`level.json` は変更していない。

### 3.1 `vm` を使う 15 件の validator (学習者のコードを評価する)

対象: `arrays`、`classes`、`forEach`、`instantiation`、`js_declare_function`、`js_declare_variable`、`js_declare_variable_multiple`、`js_function_arguments`、`js_split_east_laser`、`js_split_north_laser`、`js_split_west_laser`、`loopFilter`、`loopGetIndexes`、`loopMap`、`loopReduce`。

- 変更前: 学習者が自分のワークスペースに作ったファイル (`TQ_JAVASCRIPT_WORKSPACE_PATH` 配下) を読み、`new vm.Script(...).runInNewContext(...)` で 2 回実行 (1 回目はそのまま、2 回目は末尾に `__TQ.<変数> = <変数>` を足して) し、`__TQ` から変数を取り出していた。
- 変更後: 同じファイルを `helper.fs.readAsync` で読み、`helper.pullVarsFromUserCodeLocalScope(userCode, ['変数名', ...])` に渡す。戻り値の扱いは変更前の `scriptContext.__TQ` と同じで、エラー用のキーだけが `error` から `_error` に変わった (`tq.error` を `tq._error` に置換)。それ以外の判定コード (型や値の検査) は触っていない。

既存の `helper.pullVarsFromQuestIdeUserCodeLocalScope` は使えない。これは QuestIDE が保存した `user_code.js` (アプリのデータディレクトリ) を読むもので、本パッケージが評価するのは学習者が自分のワークスペースに作ったファイルだからである。保存場所を変えることは学習者の課題を変えることになるので行わない。

そこで `ValidationHelper.js` に小さな汎用メソッドを追加した。

- `pullVarsFromUserCodeLocalScope(userCode, keys = [])`: 文字列で渡されたコードを評価して、最上位変数の値を返す。実装は `pullVarsFromQuestIdeUserCodeLocalScope` の本体をそのまま移したもの (`vm` を内部で使う点も含めて変更なし。チケット #26 で置き換える)。
- `pullVarsFromQuestIdeUserCodeLocalScope(keys, objective, mission)`: 保存済みコードを読んで上記を呼ぶだけになった。挙動は同じ。

挙動の差 (軽微):

- 実行コンテキストに `fetch`、`window`、`process`、`URL`、`URLSearchParams`、`require` が加わる (変更前は `process` のみ、または何も無し)。学習者のコードが参照できるグローバルが増えるが、減るものは無い。
- 先頭に `String.prototype.replaceAll` のポリフィルが付く。学習者のコードの先頭に `'use strict'` を書いていた場合、ディレクティブとして効かなくなる (本パッケージの課題で `'use strict'` に依存するものは無い)。

### 3.2 `scripts/objectiveValidation.js` (共有スクリプト)

実行時に `require` される共有スクリプトで、8 件の validator (`fizzBuzz`、`js_basics_cli_args`、`js_north_bridge`、`js_scientist_bridge`、`js_south_bridge`、`js_split_south_laser`、`js_unlock_door`、`js_west_bridge` が `executeCodeString`)、`arrays2` と `arrayFunctions` (`evaluteAssertions`)、および `js_node_workspace` (`NiceError`) が使う。helper の API に載せ替えた。

| 変更前 | 変更後 |
| --- | --- |
| `require("electron").remote.app.getPath("appData")` 配下に `javascript_validator/` を作り、検証コードを `validate.js` に書き出し、`spawn(node, [validate.js, ...args])` で実行 | 検証コードを一時ファイルに書かず `helper.exec(node, ["-e", code, "validate.js", ...args])` で実行。`-e` の場合 `process.argv` に実行ファイルのパスが入らないため、ダミーの引数 `validate.js` を 1 つ挟んで、`process.argv[2]` が最初の引数になる従来の並びを保つ。モジュール読み込み時の `jetpack.dir(...)` による副作用 (appData への `javascript_validator` ディレクトリ作成) は無くなった |
| `executeCodeString(node, code, args)` | `executeCodeString(helper, node, code, args)` (第 1 引数に `helper` を追加。呼び出し側 8 件と `evaluteAssertions` を更新) |
| `spawn` の `error` イベントで `NiceError` | `helper.exec` の reject で同じ文言の `NiceError` |
| 5 秒でタイムアウト (`NiceError`。子プロセスは止めない) | `helper.exec(..., { timeout: 5000 })` に渡し、超過した子プロセスは kill される (`error.killed` を従来と同じタイムアウトの `NiceError` に写す)。従来は放置されていた暴走プロセスが残らなくなる |
| 戻り値 `{ exitCode, stdout, stderr }` | 同じ (`helper.exec` の `code` を `exitCode` に写す) |
| `jetpack.existsAsync` / `readAsync` | `helper.fs.existsAsync` / `readAsync` |
| `uuid` の `v4`、`path` | 変更なし |
| `getCodePath`、`getCode`、`getAnalyzedCode` (`esprima` による構文解析)、未使用の `writeFile` | 削除。パッケージ内のどこからも呼ばれておらず (`export` はされていた)、appData と QuestIDE の保存場所に依存する死んだコードだった。`esprima` の `require` も無くなる |
| `/.AssertionError.: (.*)/` | `/AssertionError\]?: (.*)/`。`node file.js` は `Error [AssertionError]: ...`、`node -e` は `AssertionError: ...` と標準エラーの書式が異なる (確認済み) ため、両方に合う正規表現にした |

`-e` で実行する場合、学習者のスクリプトはモジュールではなくグローバルスクリプトとして評価される (`require` は使える。`__filename` は `[eval]`、`module.parent` なども異なる)。本パッケージの課題 (引数を読んで `console.log` する、関数を定義する) では差が出ない。

### 3.3 その他の validator

- `js_node_env_setup`: `spawn(nodePath, ['--version'])` のコールバック式を `await helper.exec(nodePath, ['--version'])` に変更。`code === 0` で成功 (従来どおり `NODE_EXE` を env に保存、メッセージにバージョン文字列)、それ以外は従来の失敗メッセージ。起動自体の失敗は、従来は未処理のイベントだったが、`catch` に入り汎用メッセージで失敗する。`helper.isExecutableValid` の事前確認は変更なし。
- `create_repo`: `commandExists('git')` (npm の `command-exists`) を `helper.commandExists('git')` に変更 (見つからない場合は `not found: git` のメッセージで同じ失敗文言)。`exec('git status')` を `helper.exec('git', ['status'], { cwd })` に変更 (シェルを使わない)。非 0 終了は従来 reject だったので、`Command failed: git status` + stderr のエラーを投げて、従来どおり外側の `catch` の失敗文言に流す。`jetpack.existsAsync` は `helper.fs.existsAsync`。
- `js_node_workspace`: `jetpack.existsAsync` を `helper.fs.existsAsync` に変更しただけ (`NiceError` は共有スクリプトのまま)。
- `js_enable_laser`、`freighterFinalPuzzle`、`array2D`: 変更なし (`helper` のみで動く)。

## 4. green-keycard (Twilio 依存の目標)

調査結果: `levels/javascript/objectives/green-keycard` は、上流でも次の状態の未使用の目標だった。

- `level.json` の `objectives` に含まれず、`events.js`・会話・マップのどこからも参照されない (緑のキーカードは `visitor-signin-scientist.pug` が世界状態 `accessLevels.green` に設定し、`keycard-terminal` オブジェクトが使う。目標は介さない)。
- validator は `module.exports = (context, callback) => {}` で、`callback` を呼ばない。`require("twilio")` は未使用で、Twilio API を呼ぶ処理は存在しない。
- `walkthrough.md` だけが、別パッケージの「Twilio Account Setup」の文章の写し (Twilio アカウントの取得と認証情報の入力) だった。

決定 (ミッションは削除せず、Twilio 依存だけを除く):

- `validator.js`: 未使用の `require("twilio")` を削除。それ以外は上流のまま。目標は `level.json` から到達できず、進行ゲートに関わらないので、検証内容 (形式チェックなど) は追加していない。
- `walkthrough.md`: Twilio のアカウント・認証情報・SID・Auth Token の説明をすべて外し、`description.md` と同趣旨の短い説明 (緑のキーカードの持ち主だけが通れる。この目標のテキスト欄に入力する値は無い) に書き換えた。
- `objective.json`、`description.md`: 変更なし (もともと Twilio への言及は無い)。
- 進行は、`level.json` / `events.js` / 世界状態を変えていないので従来どおり。

## 5. 学習者への影響と既知のフォローアップ

- メッセージ、判定、報酬、ミッションの流れは同じ。学習者が見る違いは、`js_node_env_setup` で起動に失敗した場合のメッセージ (従来は応答なし) だけ。
- 本パッケージの課題は、学習者が自分のエディタでワークスペースにファイルを作り、自分の Node.js で動かす形式で、QuestIDE (`show_ide`) には依存しない。`objective.json` の `show_ide` は `false` の目標があり、QuestIDE で動かす課題は見つからなかった。したがって `code-runner-behavior.md` の Worker 版で提供できない API を要求する、QuestIDE 上の課題は無い。
- **前提**: validator はユーザーのマシンの Node.js (`TQ_NODE_EXE`、`git`) を `helper.exec` で起動し、学習者のワークスペースのファイルを `helper.fs` で読む。Tauri 版でもこの 2 つの API (子プロセス起動とユーザー指定パスの読み取り) が使えることが前提になる。
- `vm` で評価する学習者のコード (3.1 節の 15 件) には実行時間の制限が無い (従来と同じ。無限ループを書くと UI が固まる)。Worker ベースの runner (#26 / #39) で解決する。
- `pullVarsFromUserCodeLocalScope` は内部で `vm` を使う。Web Worker 化 (#26) の際に `pullVarsFromQuestIdeUserCodeLocalScope` と同時に置き換える。
- 取り込んだ `README.md`、`package.json` の `dependencies` (`command-exists`、`esprima`、`fs-jetpack`) は原文のまま (出所の記録)。実行時にはもう使わない。

## 6. テスト

- `src/test/app/common/vendoredJavaScript.test.js` (新規): 設定 (vendored / bundled / npm 依存の除去 / ロックファイル / `uuid`・`lodash.merge` が直接の依存)、メタデータ、実行時の JS に Node 専用モジュールの `require` や `process.` が無いこと、green-keycard に `twilio` が無いこと、`level.json` の全目標に validator があること、入口の JS 全件が新ローダー + 実際の許可リストで読めること (失敗 0 件)。
- `src/test/app/content/javascriptValidators.test.js` (新規): 実際の `ValidationHelper` (`helper.fs`、`helper.exec`、`pullVarsFromUserCodeLocalScope` は本物) と一時ディレクトリのワークスペースで、書き換えた validator を検証する。`vm` 系 13 件 (+ 世界状態の前提がある `js_split_east_laser`) は正解、不正解、ファイル欠落、変数未定義、学習者コードの例外。Node 実行系 8 件は正解、不正解、ファイル欠落、Node 起動失敗。`arrays2`、`arrayFunctions` (アサーション方式) の正解・不正解・関数未定義・ファイル欠落。`executeCodeString` の引数の並び、非 0 終了、起動失敗、タイムアウト。`js_node_env_setup`、`js_node_workspace`、`create_repo` の成功系と失敗系。Node の実行には PATH 上の `node` を使う (jest は Electron ランナーで動くため `process.execPath` は使えない)。
- `ValidationHelper.test.js`: `pullVarsFromUserCodeLocalScope` と、`pullVarsFromQuestIdeUserCodeLocalScope` からの委譲のテストを追加。

## 7. 手元での確認 (アプリは起動していない)

1. `npm install` 後、`public/node_modules/twilioquest-javascript` が存在しないこと。
2. 新規ゲームから JavaScript Test Lab (`javascript` レベル) が従来どおり読み込めること。
3. 目標を順に進める (Node.js のパス、ワークスペース、各課題)。
   - `js_node_env_setup`: 実在する Node.js のパスで成功しバージョンが表示される、存在しないパスで失敗する。
   - `js_node_workspace`: 存在するディレクトリで成功する。
   - 課題のファイル (`laserConfiguration.js` など) を作って HACK し、正解で成功、誤りで従来のヒント文が出ること。Node で実行する課題 (`sayPlease.js`、`divideByTwo.js`、`northBridgeControl.js`、`enhancedLifeDetector.js`、`treeLifeDetector.js`、`shouldWater.js`、`sortOrder.js`、`fizzBuzz.js`) は引数が正しく渡ること。
   - `arrays2` (`addFirstToLast.js`)、`arrayFunctions` (`getFirstAmountSorted.js`) で、誤った関数のときにアサーションのメッセージが表示される。
   - `create_repo`: git のリポジトリを作成してコミットし、成功すること。コミット前は「initial commit がない」のメッセージ。
4. Windows でも `fizzBuzz` などが成功すること (検証コードを `node -e` の引数で渡すため、長さの上限は約 32,000 文字。本パッケージの検証コードは数 KB)。
5. `appData` に `TwilioQuest/javascript_validator` ディレクトリが作られなくなったこと。
