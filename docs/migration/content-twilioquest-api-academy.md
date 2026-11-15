# Phase 5 / 5c: twilioquest-api-academy の取り込みと Twilio 検証・Node 専用 API の除去

Issue #31。`twilioquest-api-academy@3.0.2` (`public/package-lock.json` が解決していたバージョン。`integrity` の sha512 が `npm pack` の tarball と一致することを確認済み) を `public/content/twilioquest-api-academy/` に取り込んだ (272 ファイル、約 3.8MB。`LICENSE`、`README.md`、`package.json` を保持)。取り込み方式は `content-layout.md` に従う。

## 1. 取り込みに伴う設定変更

- `src/js/app/config/vendoredExtensionModules.json` に `twilioquest-api-academy` を追加。
- `public/package.json`: `twilioquest-api-academy` を削除。取り込んだ `scripts/updateQuestLogWhenComplete.js` が `require("compare-versions")` するが、これまで `public/node_modules` には本パッケージの推移的依存としてしか入っていなかったため、`compare-versions: ^4.1.3` を直接の依存に追加した (`lodash.merge` は既に直接の依存。`twilio` は他の拡張機能と `public/package.json` 自身が使うので残す)。
- `public/package-lock.json` (lockfileVersion 1): `twilioquest-api-academy` のエントリ (ネストした `twilio@3.74` とその依存を含む 102 行) を手で削除した。最上位の `compare-versions` / `lodash.merge` / `twilio` は残る。

## 2. 実行時に読み込まれる JS の `require` の洗い出し

入口 (`objects/*/config.js`、`levels/*/events.js`、`levels/**/validator.js`) とそこから到達する `scripts/` を走査した。許可リスト外のものは次の 3 件だけだった。

| ファイル | 許可リスト外の require | 対応 |
| --- | --- | --- |
| `levels/inside_perimeter/objectives/twilio_api_setup/validator.js` | `twilio` | Twilio 検証を除去 (3 節) |
| `levels/inside_perimeter/objectives/lovelace_key/validator.js` | `twilio` | Twilio 検証を除去 (3 節) |
| `levels/lovelace_tower/objectives/api-02-async-await/validator.js` | `fs` (`readdirSync`) | `helper.fs.readdir` に置換 (4 節) |

`hopper_key/validator.js` はコメントアウトされた Twilio 呼び出しだけが残っていた (実行されない)。`levels/lovelace_tower/objectives/api-02-async-await/example.js` の `require("fs").promises` は学習者に見せるコードで、アプリが読み込むものではない (5 節)。`assert`、`lodash.merge`、`compare-versions`、`path` は許可リストにある。

## 3. Twilio 依存の 3 ミッション (削除せず、検証 (ゲート) だけ除去)

方針: Twilio API を呼ばず、`twilio` パッケージも要求しない。目標の名前、報酬 (xp 100)、`level.json` / マップ / `events.js` は変更しない。

### twilio_api_setup (Statue of Truth: アカウント認証情報の入力)

- 変更前: `twilio(accountSid, authToken)` で Account SID を検証し、`client.api.accounts(accountSid).fetch` で実在確認。失敗時は認証情報が不正という旨のメッセージ。
- 変更後 (`validator.js`): 入力の形式だけを検査する。Account SID は `^AC[0-9a-f]{32}$` (大文字小文字不問)、Auth Token は `^[0-9a-f]{32}$`。どちらかが空なら従来どおり「required」のメッセージ。SID の形式不正は従来文言に近い SID 形式の説明、Auth Token の形式不正は新規メッセージ。成功時のメッセージと `env` (`TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN` (concealed)) は従来と同じ。`console.log(err, response)` は削除した。
- 変更後 (テキスト): `description.md` と `walkthrough.md` の「認証情報が検証される (正しければ)」という文を「形式だけが検査され、Twilio には送信されない」という内容にした。`objective.json` (ラベル含む) は変更なし。アカウント取得の案内は、後続の Twilio 関連の目標 (cURL でメッセージ送信) の準備として残した。

### lovelace_key (House Lovelace の鍵: Twilio SMS API の質問)

- 変更前: 3 問目のメッセージ SID を `client.messages(sid).fetch()` で実在確認 (失敗は「そのSIDのメッセージが見つからない」)。
- 変更後 (`validator.js`): `^(SM|MM)[0-9a-f]{32}$` の形式だけ検査。不一致なら「message SID に見えない」という趣旨のメッセージで失敗。1・2 問目の判定と成功メッセージは変更なし。未使用になった `helper.env` の取り出しは削除。
- 変更後 (テキスト): `objective.json` の `answer3` のラベル末尾に「SID は形式 (`SM` または `MM` + 16進32文字) だけ検査される」を 1 文追加。

### hopper_key (House Hopper の鍵: Postman の質問)

- 変更前から検証は質問 4 問の文字列一致のみで、Twilio 呼び出しはコメントアウトされていた。
- 変更後 (`validator.js`): コメントアウトされた Twilio 呼び出しと、未使用の `helper.env` の取り出しを削除しただけ。判定とメッセージは変更なし。テキスト変更なし。

### 進行ゲートの確認

- ゲートは `twilio_api_setup` の完了で、`events.js` の `objectives.twilio_api_setup` が `twilioApiSetupComplete()` (カタコンベの柵 `catacombs_barrier` を開け、`statue_credentials` を hack 不可にする) を呼ぶ。さらにゴースト NPC との会話時に `checkCredentials()` が `env` の `TQ_TWILIO_ACCOUNT_SID` / `TQ_TWILIO_AUTH_TOKEN` の存在でも同じ処理を呼ぶ。新しい validator は成功時に同じ `env` を返すので、どちらの経路も従来どおり動く。
- `lovelace_key` / `hopper_key` の完了は `obtainKeySpellComplete("lovelace_flame" / "hopper_flame")` で、4 つの鍵がそろうと `magic_key` が解放される。目標名は変更していないので、この流れは変わらない。
- `src/test/app/common/vendoredApiAcademy.test.js` で、(a) `level.json` の目標がすべて validator を持つこと、(b) `events.js` の上記 3 つの対応が残っていること、(c) `twilio_api_setup` が返す `env` 名に `TQ_` を付けたものを `events.js` が参照していること (Validator.jsx は `TQ_` を補う)、を検証している。`events.js` そのものの実行 (ワールドのモック) は行っていない。

## 4. api-02-async-await の validator (`fs` -> `helper.fs`)

- `const { readdirSync } = require("fs")` を削除し、`readdirSync(testDirectory)` を `await helper.fs.readdir(testDirectory)` に置換 (validator は元から `async function`。`readdir` と `readdirSync` は同じ順序の一覧を返す)。`__dirname` は新ローダーが提供する。成功・失敗メッセージ、判定は変更なし。

## 5. 既知のフォローアップ (プロダクトオーナーに要判断)

- **api-02 の学習者向けコード**: `example.js` と `walkthrough.md` は学習者に `const { readdir } = require("fs").promises;` を書かせる。この学習者コードは QuestIDE で実行されるため、予定されている Web Worker 実行では `fs` を使えない。学習者向けの課題を黙って変えないため、本チケットではこのままにした (`code-runner-behavior.md` のコード実行側の対応表に従う後続対応: `fs.promises.readdir` 相当の提供、または課題の書き換え)。同様に api-03/04/05 は `fetch` を使い、api-05 は `helper.fetchOverride` を使っていた。
- **#120 (3 段目) での更新**: validator (api-01 / 02 / 04 / 05) は Worker 方式に載せ替えた (`validation-helper-worker.md`)。検証の Worker には `fs` (`require("fs").promises.readdir` がテスト用ディレクトリだけを返す) と、api-05 の偽 `fetch` (`fetchOverride` を validator に移したもの。`ValidationHelper.fetchOverride` は削除) を入れるので、HACK の合否は従来どおり。QuestIDE の試し実行 (`code_runner`) は `require` も偽 `fetch` も無いままで、`example.js` は `ReferenceError` になる (上の決定事項は未解決)。
- **実在しない認証情報**: `twilio_api_setup` が形式だけを見るため、形式を満たすダミーの値でも進行できる。値は `env` に保存され、`gameEvents.js` の分析イベントに `accountSid` として送られる (従来も入力値をそのまま送っていた)。他の拡張機能 (取り込み前の `twilioquest-twilio-vr` など) が実在する認証情報を使って Twilio を呼ぶ場合、ダミー値では失敗する。
- `twilio` / `compare-versions` 以外の依存の見直し、`tq-npc` の動的 require は本チケットの範囲外 (`content-layout.md` 参照)。

## 6. テスト

`src/test/app/common/vendoredApiAcademy.test.js` (新規、20 件): レイアウトと設定、`twilio` を要求するソースが無いこと、入口の JS (`objects/*/config.js`、`levels/*/events.js`、`levels/**/validator.js`) が新ローダー + 実際の許可リストですべて読めること (失敗 0 件)、`twilio_api_setup` / `hopper_key` / `lovelace_key` / `api-02-async-await` の validator の成功系・失敗系 (偽の `helper` を使用)、進行ゲートの確認。

## 7. 手元での確認 (アプリは起動していない)

1. `npm install` 後、`public/node_modules` に `twilioquest-api-academy` が入らないこと。
2. 新規ゲームから API Academy のレベル (`api_academy`、`house_ceremony`、`inside_perimeter`、`lovelace_tower`) が従来どおり読み込めること。
3. `inside_perimeter` のカタコンベ: Statue of Truth で Account SID (`AC` + 16進32文字) と Auth Token (16進32文字) を入力し、柵が開くこと。形式不正でエラーになること。ゴーストに話しかけても同じ状態になること。
4. `lovelace_key`: 1 問目 `true`、2 問目 `to`、3 問目に `SM...` / `MM...` + 16進32文字を入れて成功すること。形式不正で失敗すること。`hopper_key` の質問が従来どおり (`confirm` / `false` / `authorization` / `b`) 動くこと。4 つの鍵がそろうと `magic_key` が出ること。
5. `lovelace_tower` の api-02: `findLastFileInDir` を実装して HACK すると成功すること (validator は `helper.fs.readdir` を使う)。QuestIDE 側の `fs` の扱いは 5 節のとおり。
