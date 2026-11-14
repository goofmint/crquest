# Phase 5 / 5b: twilioquest-dev-fundamentals の取り込みと検証関数の Node 依存の除去

Issue #30 の成果物である。取り込み方式は `docs/migration/content-layout.md` に従う。

## 1. 取り込み

- `public/content/twilioquest-dev-fundamentals/` は npm の `twilioquest-dev-fundamentals@2.4.0` の tarball の `package/` である (69 ファイル)。`public/package-lock.json` の `integrity` (sha512) が tarball と一致することを確認した。`LICENSE`、`README.md`、`package.json` は原文のまま。
- `src/js/app/config/vendoredExtensionModules.json` に名前を追加。`public/package.json` の依存と `public/package-lock.json` のエントリ (1 件。`lodash.merge` の `requires` のみで、`lodash.merge` 本体は直接の依存として残る) を削除した。
- 実行時に使う bare モジュールは `lodash.merge` のみで、`public/package.json` に直接の依存として既にある。追加の依存は無い。

## 2. 実行時に読み込まれる JS の `require` 一覧 (調査結果)

| ファイル | `require` |
| --- | --- |
| `levels/*/events.js` (2 件) | `lodash.merge` (許可リスト内)、相対 `./events/*` |
| `levels/*/events/*.js`、`objects/*/config.js`、`scripts/objectiveCompletionResponder.js` | 相対のみ / なし |
| `fs-01-path`、`fs-04-cd` の validator | なし (helper のみ) |
| `fs-02-pwd` | `fs` (`existsSync`) |
| `fs-03-ls`、`fs-07-rm` | `fs` (`existsSync`)、`path` |
| `fs-05-mkdir`、`fs-06-touch` | `fs` (`existsSync`、`lstatSync`)、`path` |
| `fs-08-hidden` | `util`、`child_process`、`fs`、`path`、`process.platform` |

Twilio のアカウント、`twilio` パッケージ、`got`、`electron`、`vm` を使うファイルは無い。したがって、ミッションの削除、Twilio 検証の除去、学習者向け文言の書き換えは不要だった。

## 3. ファイルごとの変更 (前 -> 後)

共通: validator 先頭に、`existsSync` の代わりをする関数を追加した。

```js
const exists = async (helper, filePath) =>
  (await helper.fs.existsAsync(filePath)) !== false;
```

`helper.fs.existsAsync` は存在しなければ `false`、存在すれば `'dir' | 'file' | 'other'` を返す (`existsSync` と同じく symlink は辿る)。判定順序、メッセージ、`try` の範囲、報酬 (`env`) は変えていない。

| ファイル | 前 | 後 |
| --- | --- | --- |
| `fs-02-pwd` | `require("fs").existsSync(pwd)` | `await exists(helper, pwd)` |
| `fs-03-ls` | `existsSync(...)` | `await exists(helper, ...)` |
| `fs-05-mkdir` | `existsSync` / `lstatSync(newDirPath)` | `exists` / `await helper.fs.lstat(newDirPath)` |
| `fs-06-touch` | `existsSync` / `lstatSync(newFilePath)` | `exists` / `await helper.fs.lstat(newFilePath)` |
| `fs-07-rm` | `existsSync(...NEW_FILE)` | `await exists(helper, ...)` |
| `fs-08-hidden` | 下記 | 下記 |

### fs-08-hidden の `child_process` と `process.platform`

- `process.platform` は `helper.platform` に置き換えた (webview には `process` が無いため。`ValidationHelper` が `process.platform` を保持する)。
- Windows の隠しファイル確認: 前は `exec("powershell.exe (ls -ah).Name", { cwd })` (シェル経由、非 0 終了は reject)。後は `helper.exec("powershell.exe", ["-Command", "(ls -ah).Name"], { cwd })` (シェルなし)。`helper.exec` は非 0 終了でも resolve するため、`code !== 0` のときは `Error("Command failed: ...\n<stderr>")` を投げ、従来どおり catch 節の "An error occurred ..." に流れる。`stdout.includes(newFileName)` の判定は同じ。
- 実行ファイルの引数: 前は cmd.exe の暗黙の `-Command` 解釈に頼っていたが、後は `-Command` を明示した。出力は同じ。

## 4. ホスト側 (helper / platform) の追加

`lstat` は、`lstatSync` が symlink を辿らないという挙動を保つために必要で、`stat` では代用できない (symlink への判定が変わる)。小さく汎用的なので追加した。

- `src/js/app/platform/fs.js`: `lstat` (`fs.promises.lstat`) を export。
- `ValidationHelper.js`: `helper.fs.lstat` を追加 (`helper.fs` は引き続き凍結オブジェクト)。`helper.platform` (`process.platform`) を追加。
- 既存の `isExecutableValid`、`pullVarsFromQuestIdeUserCodeLocalScope` など他の helper は変更していない。

## 5. テスト

- `src/test/app/common/vendoredContent.test.js`: このパッケージの実行時入口 (`objects/*/config.js`、`levels/*/events.js`、`levels/**/validator.js`) 全件が、新ローダー + 実際の許可リストで失敗なしに読み込めること、および全 JS に `fs` / `child_process` / `vm` / `electron` の `require` と `process.` が無いことを検証する。
- `src/test/app/content/devFundamentalsValidators.test.js`: 書き換えた 6 件の validator について、一時ディレクトリ上の実ファイルを使い、正常系・異常系 (欠落、範囲外、ファイル/ディレクトリの取り違え、symlink、fs エラーの伝播、Windows の exec 成功/不一致/非 0 終了/spawn 失敗) を検証する。
- `ValidationHelper.test.js`、`fs.test.js`: `lstat` と `helper.platform` を追加。

## 6. 学習者への影響

変更なし。メッセージ、判定、報酬、ミッションの流れは同じである。唯一の違いは内部の実装 (Windows では PowerShell をシェルを介さず起動する) である。

## 7. 手元での確認 (アプリは起動していない)

1. `npm install` 後、`public/node_modules/twilioquest-dev-fundamentals` が存在しないこと。
2. 起動して `tower_exterior` -> `tower_of_knowledge` に入り、fs-01 から fs-08 を順に進める。
   - fs-02: 実在するパスで成功、存在しないパスで失敗メッセージ。
   - fs-05: pwd の外のディレクトリ、ファイルを渡したときの失敗。
   - fs-06 / fs-07: ファイル作成後に成功、削除前は fs-07 が失敗。
   - fs-08 (macOS/Linux): `.sneaky.txt` で成功、`sneaky.txt` で "isn't hidden"。
   - fs-08 (Windows): `attrib +h` 前後で結果が変わること。
3. エレベーター (`DevFundamentalsElevator`) と同梱拡張機能一覧に従来どおり表示されること。
