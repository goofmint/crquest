# チーム・オペレーションの参加と貢献集計

Issue #188 のサーバー側の仕様。マイグレーションは `supabase/migrations/*_groups_and_contributions.sql`。
チーム機能の対象は「所属」と「認定達成の共有・集計」で、リアルタイム協力プレイは対象外である。

## 構成

- `public.groups`: チームとオペレーション。`kind`（`team` / `operation`）で区別する共通テーブル。作成は運用者（service role または SQL）だけが行う。
- `public.group_memberships`: 所属履歴。`joined_at` と `left_at`（NULL は所属中）を持つ。離脱で行は削除せず `left_at` を設定する。
- `public.certified_achievements`: サーバーが認定した達成の台帳。チーム貢献の唯一の集計元で、#189（認定）と #190（ランキング）が再利用する。

3 テーブルとも RLS を有効にし、`anon` / `authenticated` にテーブル権限もポリシーも与えない。アクセスは次の RPC だけである。`service_role` とテーブル所有者は RLS を迂回する（運用者の操作と後続の認定処理用）。

## RPC

すべて `SECURITY DEFINER`、`search_path` 固定、`EXECUTE` は `authenticated` のみ。利用者は引数ではなく `auth.uid()` で特定するため、他ユーザーの代理操作はできない。Data API（`POST /rest/v1/rpc/<name>`）で呼ぶ。

| 関数 | 引数 | 戻り値 |
| --- | --- | --- |
| `join_group` | `p_kind`, `p_join_code` | `group_id`, `kind`, `display_name`, `join_code`, `joined_at` |
| `leave_group` | `p_group_id` | なし |
| `list_my_groups` | `p_kind`（省略可） | `join_group` と同じ列（所属中のみ） |
| `get_group_contribution` | `p_group_id` | `total_points`, `achievement_count`, `contributor_count` |

エラー:

| 条件 | SQLSTATE | メッセージ |
| --- | --- | --- |
| 未認証（`anon`、`sub` のない JWT） | `42501` | `not authenticated` |
| コードが存在しない、または `kind` が違う | `P0001` | `invalid_join_code` |
| すでに所属中 | `P0001` | `already_member` |
| 所属していない（他ユーザーの所属への離脱、非メンバーの集計を含む） | `P0001` | `not_member` |

PostgREST では業務エラーは HTTP 400 とメッセージで返る。クライアントはメッセージを既存の i18n エラー表示に対応付ける。

## 規則

- 参加コード: 前後の空白（半角スペース、タブ、改行）を除いて大文字にしたものを保存・照合する。保存値は CHECK で正規化済みかつ 6 文字以上を強制し、`(kind, join_code)` は一意。コードが存在しない場合と `kind` が違う場合は同じ `invalid_join_code` を返し、存在有無を漏らさない。
- 重複防止: `left_at IS NULL` の `(group_id, user_id)` に部分一意インデックスがある。並行して加入しても 1 行だけが残り、後の呼び出しは `already_member` になる。離脱後の再加入は新しい行になる。チームとオペレーションは独立して複数所属できる。
- 離脱: 自分のアクティブな所属だけに `left_at` を設定する。0 件なら `not_member`。
- 公開範囲: グループ情報と集計は現在の所属メンバーだけが取得できる。コード照合に成功したときだけ `display_name` を返す。メンバー別の内訳、他ユーザーの ID、個人別の点数は返さない。
- ブルートフォース: 参加コードの推測への対策は、6 文字以上の長さと Supabase 側のレート制限に依存する。RPC 単位の試行回数制限は未実装（要検討）。

## 集計の規則（加点時の所属と離脱後の扱い）

- 達成の `certified_at` が、同じ利用者の所属期間 `[joined_at, left_at)`（半開区間、`left_at` が NULL なら終わりなし）に入る場合に、そのグループへ計上する。
- 所属中に認定された貢献は、離脱後もグループに残る。離脱後・加入前に認定された達成は計上しない。再加入しても離脱中の達成は遡って計上されない。
- 1 つの達成は、認定時刻に所属していたすべてのグループに計上する。チームとオペレーションで規則は同じ。
- 時刻はサーバーの `now()` / `clock_timestamp()`。`certified_at` は台帳の書き込み側（サーバー）が決め（既定値・明示設定とも `clock_timestamp()`）、`joined_at` / `left_at` は RPC が決める。並行トランザクションの境界では、コミット済みの値で結果が決まる。境界上（加入時刻ちょうどは含む、離脱時刻ちょうどは含まない）の扱いは半開区間で一意に決まる。
- クラウドセーブ（`cloud_saves`）は自己申告データであり、集計には使わない。

## 認定達成台帳の書き込み契約

- `authenticated` / `anon` は台帳に書き込めない（権限なし）。書き込み主体は認定 RPC `submit_certification_challenge`（SECURITY DEFINER、#189。[certification.md](certification.md)）だけで、`ON CONFLICT` により 1 目標 1 回しか加点されない。
- `(user_id, mission_id, objective_id)` は一意で、同じ達成の二重計上を防ぐ。書き込み側は冪等に扱える。
- `points` は認定時点の値で、後から再計算しない。目標の設定が変わっても集計値は変わらない。

## 削除時の扱い

- 利用者を削除すると、所属履歴と台帳の行も CASCADE で削除され、その利用者の貢献は集計から消える。
- グループを削除すると、所属履歴が CASCADE で削除される。台帳は残る。

## スコープ外

- リアルタイム協力プレイ。
- クライアント接続。Rust コマンドによる RPC 呼び出しと、`teams.js` / `operations.js` / オンボーディングの Firebase 参加コード照合の置き換えは別 Issue で行う（cloud_save と同じく、認証セッションを使う Rust コマンド経由とし、JS にトークンを渡さない）。このため旧参加フローは変更していない。
- ローカル GUID と Supabase ユーザーの対応（#187）。旧 API の所属データの移行。
- 利用者によるグループ作成。

## ローカルでの検証

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test   # supabase/tests/database/groups_and_contributions.test.sql
npm run sync:missions -- --target local   # カタログと検証定義を先に発行する（スモークの認定検証が使う）
npm run supabase:smoke  # 実 JWT の 2 ユーザーで RPC を確認（実行ごとに service_role で作る専用グループを使う）
```

pgTAP は有効／無効コード、正規化、重複加入、離脱・再加入、他ユーザー操作の拒否、直接アクセスの拒否、未認証の拒否、集計（加入前／所属中／離脱後／離脱中、複数メンバー、台帳の一意制約）、関数属性と権限を検証する。台帳へのデータ投入は集計テストのためだけに `postgres` で行う。
