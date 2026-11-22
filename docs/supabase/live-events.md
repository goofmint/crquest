# ライブイベントと公開ランキング（Issue #190）

ライブイベントの設定、参加資格、受付期間、個人・チームのランキングをサーバー（Supabase）で判定・集計する。マイグレーションは `supabase/migrations/*_live_events_and_rankings.sql`。Firestore の `liveEvents` 読み取りと `liveEventAchievements` への書き込みは、この仕組みで置き換えた（クライアントからの達成の自己申告とクライアント時刻による期間判定は廃止）。

## 信頼の境界

- スコアの元は `public.certified_achievements`（[teams-operations.md](teams-operations.md)）だけ。台帳へ書き込めるのは認定 RPC `submit_certification_challenge`（[certification.md](certification.md)）だけで、加点値は `mission_objectives.xp`（サーバー側の定義）から決まる。イベント専用の書き込み経路は無い。
- クラウドセーブ（`cloud_saves`、自己申告データ）、`settings.name`、Auth の `user_metadata` は、参加・集計・公開のどれにも使わない。
- 時刻はすべてサーバー時刻（`clock_timestamp()`）。クライアントの時刻は使わない。

## 構成

- `public.live_events`: イベント。`starts_at` / `ends_at`、`status`（`draft` / `published`）、任意の `required_group_id`。作成・変更は運用者（service role または SQL）だけ。`ends_at > starts_at` を CHECK で強制する。
- `public.live_event_participants`: 参加記録（`(event_id, user_id)` が主キー）。利用者が参加時に明示した公開表示名 `display_name`（前後空白なしの 1〜32 文字、制御文字・双方向制御・ゼロ幅文字は不可。CHECK で強制）、`show_in_ranking`、`joined_at`（既定値 `clock_timestamp()`）を持つ。
- `ranking_private`: 集計の共通関数（`participant_scores` / `team_scores`）。API には公開しない。

2 テーブルとも RLS を有効にし、`anon` / `authenticated` にテーブル権限もポリシーも与えない。アクセスは次の RPC だけである。

## RPC

すべて `SECURITY DEFINER`、`search_path` 固定。利用者は `auth.uid()` で特定する。Data API（`POST /rest/v1/rpc/<name>`）で呼ぶ。

| 関数 | 実行できるロール | 引数 | 戻り値 |
| --- | --- | --- | --- |
| `list_live_events` | `anon`, `authenticated` | なし | `event_id`, `title`, `starts_at`, `ends_at`, `phase`, `is_open` |
| `get_live_event_ranking` | `anon`, `authenticated` | `p_event_id`, `p_limit`（既定 50）, `p_offset`（既定 0） | `rank`, `display_name`, `score`, `achievement_count`, `total_count` |
| `get_live_event_team_ranking` | `anon`, `authenticated` | 同上 | `rank`, `display_name`, `score`, `achievement_count`, `contributor_count`, `total_count` |
| `join_live_event` | `authenticated` | `p_event_id`, `p_display_name`, `p_show_in_ranking` | `event_id`, `display_name`, `show_in_ranking`, `joined_at` |
| `update_live_event_participation` | `authenticated` | `p_event_id`, `p_display_name`（省略可）, `p_show_in_ranking`（省略可） | `join_live_event` と同じ列 |
| `get_my_live_event_status` | `authenticated` | `p_event_id` | `joined`, `display_name`, `show_in_ranking`, `score`, `achievement_count`, `rank` |

エラー: 未認証は `42501`（`not authenticated`）。業務エラーは `P0001` とメッセージで区別する。PostgREST では HTTP 400 とメッセージで返る。

| メッセージ | 意味 |
| --- | --- |
| `event_not_found` | 存在しない、または下書き（区別しない） |
| `event_closed` | 受付終了（`now() >= ends_at`） |
| `not_eligible` | 必須グループのアクティブなメンバーでない |
| `invalid_display_name` | 表示名が空、33 文字以上、制御文字などを含む |
| `already_participant` | 参加済み |
| `not_participant` | 参加していない（更新時） |

## 参加資格と受付期間

- イベントが `published` であること。下書きと存在しないイベントは、どの RPC でも `event_not_found` で区別しない。
- `required_group_id` があれば、利用者がそのグループ（例: オペレーション）のアクティブな所属（`left_at IS NULL`）であること。なければ誰でも参加できる。参加コードは使わない。
- 受付は `ends_at` の直前まで（`now() < ends_at`、半開区間、猶予なし）。開始前でも参加できる。
- 同じ `(event, user)` の参加は advisory lock で直列化し、二重参加は `already_participant`。
- 参加の取り消し（退出）の RPC は無い。ランキングに載りたくない場合は `update_live_event_participation` で `show_in_ranking = false` にする。利用者（Auth）を削除すると、参加記録は CASCADE で消える。

## 集計期間（遡及しない規則）

参加者ごとに、`certified_at` が次の半開区間に入る台帳の行だけを数える。

```
[ greatest(starts_at, joined_at), least(ends_at, 呼び出し時刻) )
```

- 開始時刻ちょうどの行は含み、終了時刻ちょうどの行は含まない。参加時刻ちょうどは含む。
- 参加前の達成、開始前の達成、終了後の達成は計上しない。呼び出し時刻より後の時刻の行（特権側が将来時刻で投入したもの）も除外する。
- スコアは台帳の `points`（認定時点の値）の合計。達成数は行数。
- 未認定の達成（クラウドセーブの `xp` や完了目標）、参加していない利用者の達成は計上されない。

### 台帳の一意制約との関係

台帳は `(user_id, mission_id, objective_id)` が一意で、1 つの目標は利用者ごとに全体で 1 回しか認定されない（[teams-operations.md](teams-operations.md)）。そのためイベントの得点は「イベント集計期間内に初めて認定された目標」の `points` になる。イベント参加前（または開始前）に認定済みの目標は、同じ目標を再度解いても再認定されず、そのイベントには計上されない。この遡及しない規則は、既存のグループ集計の「所属後のみ計上」と同じ考え方である。同じ達成を提出し直しても台帳は増えない（`ON CONFLICT DO NOTHING`、再投入は `23505`）ので、二重提出でスコアは増えない。

## 公開項目と非公開項目

公開 RPC が返すのは、公開表示名（またはチーム表示名）、順位、スコア、達成数、貢献者数（チームのみ）、総件数、イベントのタイトルと期間・段階だけである。

返さないもの: `user_id`、グループ ID、参加コード、メールアドレス、OAuth 情報（プロバイダーの名前・アバターなど）、セーブ内容、`required_group_id`、個人別の内訳（チームのメンバー）。公開 RPC の返却列は pgTAP で固定して検査している。

## 参加・表示の扱い

- 公開表示名は利用者が参加時に明示して入力する。OAuth の名前や `settings.name` を自動では公開しない（UI は `settings.name` を入力欄の初期値として提示するだけで、送信は利用者の操作による）。表示名は一意にしない。
- 個人ランキングに載るのは `show_in_ranking = true` の参加者だけ（0 点の参加者も含む）。非表示の参加者は個人ランキングから除外し、`get_my_live_event_status` の `rank` も `NULL`（順位を返さない）。
- 非表示の参加者の達成は、チームの集計には計上する（個人は特定できない）。

## 同点とページング

- 順位はスコア降順の `RANK()`（例: 1, 1, 3）。同点内の表示順は内部 ID で固定する（個人は `user_id`、チームは `group_id`。どちらも返さない）。
- `p_limit` は 1〜100 に丸め（既定 50。NULL は 50）、`p_offset` は 0 以上（負と NULL は 0）。`total_count` は全ページ分の件数で、各行に同じ値が入る。範囲外の `offset` では行が 0 件になり、`total_count` も得られない（クライアントは 0 件として扱う）。

## チームの計上

- 対象は `kind = 'team'` のグループ（オペレーションは対象外）。計上対象の達成（上の集計期間に入るもの）を、`certified_at` がその利用者のチーム所属期間 `[joined_at, left_at)` に入るチームに計上する。離脱後の達成は計上されず、在籍中の達成は離脱後も残る。
- 複数チームに所属していれば、各チームに計上する。同じチームの重複した所属履歴があっても、(達成, チーム) の組は 1 回しか数えない。
- 計上対象の達成が 1 件以上あるチームだけがランキングに載る。表示名はチームの `display_name`（運用者が設定した公開名）。

## クライアント接続

- Rust: `src-tauri/src/live_events/`（`mod.rs` がサービスとコマンド、`remote.rs` が HTTP）。公開読み取り（一覧、個人・チームランキング）は publishable key だけを使い、ユーザーのトークンを付けない（サインインしていなくても動く）。参加・表示設定の更新・自分の状況は、認証セッションのアクセストークンを Rust 内で使い、cloud save と同じく `expectedAccount` の fingerprint が一致しなければ `account_changed` で失敗する。エラーは `signed_out` / `account_changed` / `offline` / `server` / `unauthorized` / `rejected` と、上の業務エラーの固定コードだけを返す（サーバーのメッセージ、URL、トークンは返さない）。
- JS: `src/js/app/platform/liveEvents.js`（`tauri/liveEvents.js`）。拒否は `error.liveEventCode` に入る。トークンも JS 用の Supabase クライアントも無い。
- UI: 設定の「ライブイベント」タブ（`LiveEventsSettings.jsx`）。参加状態はサーバーが正で、ローカルの context にもクラウドセーブにも保存しない。
- `Validator.jsx` から Firestore のライブイベント経路（`liveEvents` の読み取り、クライアント時刻の期間判定、`liveEventAchievements` への書き込み、`liveEvent` の解除）を削除した。Firebase 自体（解除コード、旧ミッション同期、初回セットアップの参加コード照合）は残る。`liveEvent`（旧データ）は `schema.js` に nullable のまま残るが、スコアには使わない。
- 範囲外: 達成を認定へつなぐクライアント接続（`Validator.jsx` の初回達成時に認定チャレンジを発行・提出する処理）は #189 の後続。それまでライブイベントのスコアはクライアントの操作では増えない。

## 運用

イベントは運用者が service role または SQL で作る。

```sql
INSERT INTO public.live_events (title, starts_at, ends_at, status, required_group_id)
VALUES ('Spring Cup', '2026-04-01T00:00:00Z', '2026-04-08T00:00:00Z', 'published', NULL);
```

`draft` から `published` に変えると公開される。公開後に期間を変えると集計期間も変わる（参加者の `joined_at` は変わらない）。

## ローカルでの検証

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test                       # pgTAP: supabase/tests/database/live_events.test.sql
npm run sync:missions -- --target local    # カタログと検証定義を発行（スモークの前提）
npm run supabase:smoke                      # 実 JWT: 参加、認定後のスコアと順位、チーム、公開項目
npm run supabase:stop
```

pgTAP は、権限、参加資格の各エラー、表示名の検証、期間境界（開始ちょうど・終了ちょうど・開始前・参加前・終了後・将来時刻）、未認定（非参加者、`cloud_saves`）の除外、二重提出（`23505` とスコア不変）、個人・チームの集計、複数チーム・離脱後・重複した所属履歴・非表示参加者、同点（1, 1, 3）、ページングと丸め、公開項目を検証する。スモークは、認定 RPC で得た加点が、イベントのスコアとチームの得点に一致することを実 JWT・PostgREST 経由で確認する。
