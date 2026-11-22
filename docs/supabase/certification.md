# 達成の認定（Issue #189）

利用者が提出した「結果」をサーバーで照合し、正解のときだけ `public.certified_achievements`（[teams-operations.md](teams-operations.md)）に達成を記録する。**提出コードの実行や隔離環境は無い**。サーバーは、保存済みの期待結果と提出された結果を比較するだけである。

## 信頼の境界

- 加点値は公開カタログの `public.mission_objectives.xp`（サーバー側のミッション定義）から読む。クライアント、クラウドセーブ、`objective.json` の値は使わない。クラウドセーブ（自己申告データ）は認定にも集計にも使わない。
- 検証定義（方式・入力・期待結果）は `catalog_private.objective_verification_definitions.definition`（API 非公開）に置く。元データは `supabase/verification/definitions.json` で、クライアントに配布する `objective.json` / `validator.js` からは作らない。
- 発行したチャレンジは `catalog_private.certification_challenges`（API 非公開）に保存する。期待結果を含むため、一般ロールにも `service_role` にもテーブル権限を与えない。操作できるのは下の SECURITY DEFINER の RPC だけ。
- 退役した目標（`retired_at` あり）は、発行も認定もできない。発行後に退役した場合、提出は `objective_not_certifiable` になる。

## 検証方式

| 方式 | 提出値 | 照合 |
| --- | --- | --- |
| `text_answer` | 期待値と同じキー集合の文字列オブジェクト（例 `{"words":"jah vuh skrept"}`） | 前後の空白（ASCII 空白、NBSP、BOM、U+2028/2029）を除去し、`trim_lower` では小文字化して完全一致。内部の空白は正規化しない |
| `result_vector` | 発行された入力と同じ長さの配列 | 要素ごとに `jsonb` の等値比較。`6` と `"6"` は不一致 |

`result_vector` は保存した `cases`（`input` / `expected`）から `case_count` 件を無作為に選び、入力と期待結果を同じ順序でチャレンジへ複製する。`text_answer` の入力は `{}`。定義を後で変えても発行済みチャレンジの判定は変わらない。

制約: JSON は `-0` と `0` を区別できない（JS の `Object.is` との差）。定義の浮動小数点のケースは、`1.2 + 2.3 + 4 = 7.5` のように表現差が出ないものに限る。

### 定義の形式（version 1）

```json
{"method":"text_answer","normalization":"trim_lower","expected":{"words":"jah vuh skrept"},"ttl_seconds":600}
{"method":"result_vector","case_count":1,"cases":[{"input":[1,2,3],"expected":6}],"ttl_seconds":600}
```

`ttl_seconds` は 1〜86400（省略時 600）。`case_count` は 1 以上、ケース数以下。形式は `publish_verification_definitions` が検証する。

## RPC

利用者は `auth.uid()` で特定する。`authenticated` だけが EXECUTE できる。未認証は `42501`、業務エラーは `P0001`（メッセージで区別）。

### `issue_certification_challenge(p_mission_id text, p_objective_id text)`

戻り値: `challenge_id`, `mission_id`, `objective_id`, `method`, `inputs`, `expires_at`（`expected` は返さない）。

| エラー | 意味 |
| --- | --- |
| `objective_not_certifiable` | 定義が無い、存在しない、退役済み。クライアントは「ローカル進捗のみ」と扱う |
| `already_certified` | 台帳に認定済み |

### `submit_certification_challenge(p_challenge_id uuid, p_result jsonb)`

戻り値: `status`（`certified` / `already_certified` / `incorrect` / `expired`）, `points_awarded`, `newly_certified`。

| エラー | 意味 |
| --- | --- |
| `challenge_not_found`（P0001） | 存在しない、または他ユーザーのチャレンジ（区別しない） |
| `22023` | 提出値の形式の誤り（型、キー不足・余分、長さ）。チャレンジは消費しない |
| `objective_not_certifiable`（P0001） | 正解だが、目標が退役済み |

## 状態遷移

1. 発行: `expires_at = clock_timestamp() + ttl`。
2. 提出（`FOR UPDATE` で行ロック。以降は 1 つのトランザクション）:
   1. 消費済みなら、保存した結果を `newly_certified = false` で返す（再送）。台帳は変えない。
   2. `clock_timestamp() >= expires_at` なら `expired`。行は変更しない。
   3. 形式が誤りなら `22023`（消費しない）。
   4. 不正解なら `incorrect` を記録して消費する。同じチャレンジでの再挑戦はできない（再発行する）。
   5. 正解なら、台帳へ `INSERT ... ON CONFLICT ON CONSTRAINT certified_achievements_once DO NOTHING`。挿入できれば `certified` と加点値、できなければ（別チャレンジで認定済み）`already_certified` と 0 点を記録して消費する。

同じチャレンジへの同時提出は行ロックで直列化され、後続は再送として扱われる。同じ目標の別チャレンジへの同時提出は台帳の一意制約で 1 回だけ加点される。

## 認定対象を追加する手順

1. 目標がカタログ（`sync:missions`）に含まれていることを確認する（加点値は `rewards.xp` が元）。
2. `supabase/verification/definitions.json` に定義を追加する（`version` を上げる）。加点値は書かない。
3. `npm run sync:missions -- --target local|remote`。カタログ発行の後に定義が投入される。ファイルに無い定義は削除される（定義の完全な集合として扱う）。

定義の無い既存目標は、認定用の課題を追加するまでローカル進捗のままとする（`objective_not_certifiable`）。ゲーム状態の前提条件に依存する目標（例: `js_enable_laser`）、ファイルシステム、外部サービス、ローカル実行に依存する目標は対象外。

現在の定義: `challenge-questions.ducktypium-chest`（`text_answer`、`trim_lower`）、`javascript.array2D`（`text_answer`、`trim`）、`challenge-questions.sum-array`（`result_vector`、9 件から 4 件）。

## ローカルでの検証

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test                       # pgTAP: 権限、発行、正解・不正解、期限切れ、他ユーザー、再送、二重加点、貢献への反映、定義の投入
npm run sync:missions -- --target local    # カタログと検証定義を発行（スモークの前提）
npm run supabase:smoke                      # 実 JWT: 同時提出（同一チャレンジ／同一目標の別チャレンジ）と 0 以外の貢献点
npm run supabase:stop
```

## 範囲外

- Rust コマンド / `Validator.jsx` への組み込み（クライアント連携）は後続。組み込む場合は、#186 の認証セッションを使って Rust から呼び、トークンを JS に渡さない。
- 発行回数の制限と、期限切れチャレンジの削除は未実装。
