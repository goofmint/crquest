# アイテム解除コードと植樹進捗 (Issue #191)

Firebase に依存していた次の 2 つを、Supabase のサーバー側処理に移した。

- アイテム解除コード: Firestore `unlockCodes` の直接照会を、サーバーでの照合 `redeem_unlock_code` に置き換えた。
- 植樹の進捗: Firebase Hosting への `POST /quest/tracking/trees`（3 経路）を、検証付きの `record_tree_planting` に置き換えた。

どちらも、ログイン中の本人の ID（`auth.uid()`）に紐づく記録をサーバーに作る。クライアントが ID を渡す経路はない。トークンは Rust だけが持ち、レンダラーには渡さない（[auth.md](auth.md)、[cloud-save.md](cloud-save.md) と同じ境界）。

## 構成

```text
UnlocksTab / validator / trees.js
  → common/unlocks.js, common/treePlanting/（レンダラー）
  → platform/unlocks.js, platform/treePlanting.js（Tauri コマンド unlock_code_redeem / tree_planting_record）
  → src-tauri/src/rewards/（Rust: アカウント指紋の照合、セッショントークンで RPC）
  → public.redeem_unlock_code / public.record_tree_planting（SECURITY DEFINER、auth.uid()）
```

| 対象 | 内容 |
| --- | --- |
| マイグレーション | `supabase/migrations/20261122111442_unlock_codes_and_tree_plantings.sql` |
| 非公開テーブル | `catalog_private.unlock_codes`（コード → `item_key`）、`catalog_private.tree_planting_targets`（植樹対象の許可リスト）。API には公開しない |
| 公開テーブル | `public.unlock_code_redemptions`（PK `user_id, code`）、`public.tree_plantings`（PK `user_id, mission_id, target_id`）。RLS で本人の SELECT だけを許可し、INSERT / UPDATE / DELETE は誰にも付与しない |
| RPC | `redeem_unlock_code(p_code)`、`record_tree_planting(p_mission_id, p_target_id)`（`authenticated` だけ）、`publish_unlock_codes(payload)`（`service_role` だけ） |
| 運用タスク | `npm run sync:unlock-codes -- --target local\|remote --file <JSON>` |

RPC は `SET search_path = ''`、未認証（`anon`、JWT に `sub` がない）は `42501` で拒否する。業務上の結果（無効なコードなど）は例外ではなく、戻り値の `status` で返す。

## 解除コード

- 再利用範囲: コードはアカウントごとに 1 回だけ使える。同じコードを複数のユーザーがそれぞれ 1 回使える。全体で 1 回だけではない。レガシーの Firestore のルールは、リポジトリからは確認できないため、現行クライアント（コードを消費せず、ローカルの重複だけを防ぐ）に最も近い方針にした。
- 正規化: 前後の空白（空白、タブ、改行）だけを除去する。大文字と小文字は区別する（レガシーのコードを別のコードと統合しないため）。空文字と 128 文字を超える入力は無効コード。
- 戻り値: `{status: 'redeemed' | 'already_redeemed' | 'invalid_code', item_key, redeemed_at}`。
- 再送: `(user_id, code)` の一意制約で、同時の再送も 1 回にまとまる。2 回目以降は `already_redeemed` と最初の `item_key` を返す。付与済みのコードが後で退役しても、本人にはこの結果を返す。
- クライアント（`src/js/app/common/unlocks.js`）:
  - ローカルの「使用済み」リストでは送信を止めない。判定はサーバーに任せ、`already_redeemed` のときも `inventory` に無ければアイテムを付与し直す（クラウド復元などで失われたローカル付与の修復）。
  - 付与は最新の `getContext` を読み、`inventory`（重複なし）と `unlockCodes`（未記録の場合だけ）を 1 回の `setContext` で更新する。
  - `item_key` が導入済みのコンテンツに無い場合も、キーは保存する（拡張を導入すると表示される）。メッセージは「アイテムがまだ利用できない」と表示する。
- ローカルの既存のアイテム取得（目標の報酬など、`addItems`）は変更していない。

### 未ログイン・オフライン時

解除コードは、ログインしてサーバーに到達できたときだけ付与する。未ログイン、期限切れ、未設定の場合は送信せず、「ログインが必要」と表示する。オフライン、サーバーエラー、セッション拒否（`offline` / `server` / `unauthorized` / `account_changed`）では何も付与せず、通信エラーを表示して再入力を促す。保留はしない（コードの確認はサーバーの判定が前提のため）。

## 植樹の進捗

- 許可リスト（`catalog_private.tree_planting_targets`）:

  | `mission_id` / `target_id` | 種別 | レガシー識別子（`missionName` / `objectiveName`） |
  | --- | --- | --- |
  | `fog_owl` / `owl_plant_tree1` | `objective` | `owl` / `owl_plant_tree1` |
  | `dev_skills` / `skills_plant_tree1` | `objective` | `ctf` / `ctf_plant_tree1` |
  | `dev_skills` / `devskills_tree1` | `map_object` | `earthday2021` / `devskills_tree1`（対象エンティティのキー） |

  レガシー識別子は追跡用で、クライアントは送らない（`owl` や `ctf` を送ると `unsupported_target`）。ミッションカタログ（`public.mission_objectives`、[mission-catalog.md](mission-catalog.md)）の外部キーにしなかった理由: `fog_owl` はカタログに公開されておらず、カタログに植樹対象を示すフィールドもない。対象 ID は秘密ではないため、マイグレーションに定義した。
- 戻り値: `{status: 'recorded' | 'already_recorded' | 'unsupported_target', planted_at}`。許可リストにない対象、退役した対象、`NULL`、128 文字を超える入力は `unsupported_target`。ユーザーごとの重複は一意制約で防ぐ。
- 記録は attestation（クライアントの自己申告）で、サーバーが認定した達成（`certified_achievements`）ではない。ランキングやチーム貢献の集計には使わない。
- 経路: Fog Owl の目標 `validator.js`、Developer Fundamentals の目標 `validator.js`、Earth Day の `events/trees.js` の 3 つが、それぞれ `helper.recordTreePlanting()` / `world.recordTreePlanting(targetId)` を呼ぶ。ミッション ID と目標名は、現在のレベルと実行中の目標から決まり、コンテンツは渡さない。この API は webview 内にあり、セキュリティ境界ではない。最終的な検証はサーバーの許可リストが行う。

### ローカル進捗とオンライン記録の扱い

| 状況 | ローカル進捗 | オンライン記録 |
| :--- | :--- | :--- |
| ログイン中・オンライン | 即時に保存する | 即時に記録する（冪等） |
| ログイン中・オフライン（サーバーに到達できない） | 即時に保存する | アカウント指紋付きで保留し、同じアカウントで再送する |
| 未ログイン | 即時に保存する | 記録しない（後から送信しない） |
| 解除コード（未ログイン、オフライン） | 付与しない | 送信しない。メッセージで再試行を促す |

- ローカル完了を優先する。以前は Firebase の応答で目標の完了が決まっていた（403 も成功扱い）。今は、結果にかかわらず目標は完了する。メッセージだけが結果で変わる（記録済み、記録済みの再送、オンラインで保留中、ログインしていないためローカルだけ、記録できなかった）。報酬は 1 回だけで、`objectiveCompletedAgain` の動作は変えていない。
- 保留（`src/js/app/common/treePlanting/service.js`）: ストアの専用キー `treePlantingPending`（ゲームのセーブには入らず、クラウドセーブにも含めない）に、`{account, missionId, targetId}` を `(account, missionId, targetId)` で重複なく保存する。`offline` / `server` / `unauthorized`、10 秒以内に答えがない場合、記録中にサインインが変わった場合（`signed_out` / `account_changed`、植樹した時点のアカウントに帰属させる）に保留する。サーバーが拒否（`rejected` / `unsupported_target`）した場合は保留しない。
- 再送: 起動時（`contextInitialized` の後）、同じアカウントでサインインしたとき、`online` イベント、バックオフタイマー（5 秒から 5 分、クラウド同期と同じ値）。現在のアカウントと一致する項目だけを送り、`recorded` / `already_recorded` / `unsupported_target` / `rejected` で削除する。サインアウトしても保留は消さず、同じアカウントで再ログインしたときだけ再送する。別のアカウントには送らない。
- 過去のローカル進捗、クラウドから復元した進捗、未ログイン時の進捗は、後からオンラインに送らない。ローカルの進捗には、どのアカウントのものかの記録がなく、別のアカウントへの誤った帰属を避けるため。
- Clear Data は保留キューも消す。

## 運用: 解除コードの公開

実際のコードとアイテムの対応表はリポジトリに含めない（`supabase/seed.sql` には合成コード `TQ-TEST-*` だけがある）。運用者が用意した JSON を、検証してから公開する。

```bash
# 入力: {"codes": [{"code": "...", "item_key": "wand"}]}（配列だけでも可）。リポジトリの外に置く
npm run sync:unlock-codes -- --target local  --file ~/private/codes.json
npm run sync:unlock-codes -- --target remote --file ~/private/codes.json   # 環境変数は sync:missions と同じ
```

- 公開前に、各 `item_key` を同梱の拡張のアイテム（`<拡張>/items/<名前>/index.json` の `name`）で検証する。重複したコード、同じコードが異なるアイテムに対応するもの、前後に空白があるコード、長さの違反は、公開せずにエラーにする。エラーにコードの値は出さない。リポジトリ内のファイルは受け付けない。
- 公開は `publish_unlock_codes` の 1 回の呼び出し（1 トランザクション）。入力に無い既存のコードは削除せず `retired_at` を設定する。同じコードを再び含めると復活する。コードを別のアイテムに変えても、既存の付与記録は変わらない。
- `--target` は必須で、既定の接続先はない（`local` はループバックだけ）。

## ローカルでの検証

```bash
npm run supabase:start && npm run supabase:reset
npm run supabase:test          # pgTAP: unlock_codes / tree_plantings（有効・無効・退役・重複・ユーザー分離・権限・公開 RPC）
npm test                       # 解除コード、保留キュー、validator、trees.js、AsyncInputBox のモックテスト
cargo test --manifest-path src-tauri/Cargo.toml   # rewards の単体テスト（未ログイン・オフライン・アカウント不一致で送信しない）

# 実際の JWT でのエンドツーエンド（環境変数は auth_local_supabase.rs と同じ）
cargo test --manifest-path src-tauri/Cargo.toml --test unlocks_trees_local_supabase -- --ignored
npm run supabase:stop
```

統合テストは使い捨てのユーザーを 2 人作り、次を確認する: 有効コード、無効・退役・大文字小文字違いのコード、同じコードの再送（二重付与なし、最初の `item_key`）、2 人目が同じコードを使えること、植樹の記録・再送・未対応の対象（`owl` / `ctf` のレガシー識別子を含む）、ユーザー間の分離、直接の書き込みの拒否、`127.0.0.1:9` への送信が `offline` になること。

## 制約と今後の課題

- RPC ごとの試行回数制限は実装していない。`join_group`（[teams-operations.md](teams-operations.md)）と同じく、Supabase 側のレート制限に依存する。コードの総当たりへの対策が必要なら、別途検討する。
- 付与記録とローカルのインベントリの自動照合は行わない。クラウド復元やアカウント切り替えでアイテムが失われた場合は、同じコードを再入力すると `already_redeemed` で修復される。起動時やアカウント変更時の自動照合は今後の課題。
- 本番のコード対応表の取り込み（Firestore からの移行）は、運用者の承認済みエクスポートを受け取ってから行う。推測で作らない。
- `public/levels/common/dev_skills/events.js` は `require('../common/events/trees')` と書かれているが、`events.js` の位置（`levels/common/dev_skills/`）から見るとパスが一致しない。レガシー経路の到達性の問題で、このチケットでは修正していない。`trees.js` の変更は、到達可能になったときのために直してある。
- Firestore の `unlockCodes` と Firebase Hosting の植樹 API が今も稼働しているかは、リポジトリからは確認できない。
