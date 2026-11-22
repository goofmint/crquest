# ミッションカタログの公開 (Issue #192)

同梱コンテンツのミッション・目標・報酬 XP を Supabase に公開する。実績の認定（#189）は、ここで公開した ID と非公開の検証定義を使う。

## 保管先

| 種類 | 保管先 | 読めるのは | 書けるのは |
| :--- | :--- | :--- | :--- |
| 公開フィールド（ミッション） | `public.missions` | 誰でも（`anon` / `authenticated` の SELECT） | `service_role` の `publish_mission_catalog` のみ |
| 公開フィールド（目標・XP） | `public.mission_objectives` | 同上 | 同上 |
| 認定用の検証定義 | `catalog_private.objective_verification_definitions`（**API 非公開**） | サーバー側（`service_role`、DB 接続） | #189 が投入する。sync は書き込まない |

- `catalog_private` は `supabase/config.toml` の `[api].schemas` に含めない（意図的）。`anon` / `authenticated` には USAGE がなく、PostgREST からは見えない。
- 検証定義は `(mission_id, objective_id)` を主キーに、`mission_objectives` へ外部キーを張る。`definition_version`（正の整数）と `definition`（JSON オブジェクト）を持つ。形式の詳細とアクセス関数は #189 が決める。
- 公開フィールド: ミッションは `id`（レベルのディレクトリ名）、`extension`、`title`、`description`、`is_mission`、`sort_order`。目標は `mission_id`、`id`（目標名）、`title`、`description`、`xp`、`sort_order`。どちらも `retired_at` を持つ。

## 発行しないもの

`validator.js`、`validation_fields`、報酬アイテム、マップ、翻訳は発行しない。`validator.js` はクライアントで実行するコード、`validation_fields` は UI の入力定義であり、サーバーが認定に使う機械可読の定義ではない。誤って認定定義とみなさないよう、カタログには入れない。

## 選定規則と退役

- 全レベルを発行する（`is_mission` は列として保存）。非ミッションのレベルの目標にも XP が付くため。
- 目標は各レベルの `level.json` の `objectives` マニフェストに記載されたものだけ。順序が `sort_order`。スラッシュを含む参照は最後の要素を目標名とする（ランタイムと同じ）。
- XP は `rewards.xp`（無ければ 0）。0 以上の整数でなければ、接続前に失敗する。
- 同梱物から消えた行は `retired_at` を設定する（物理削除しない。認定記録が参照するため）。再び同梱されると解除される。
- 空のカタログは拒否する（全退役の事故を防ぐ）。

## ID と完了キー

ゲームの完了キー `levelName.objectiveName` は `(mission_id, id)` と 1 対 1 に対応する。ミッション ID に `.` は使えない。

## 発行コマンド

```bash
npm run sync:missions -- --target local    # ローカルスタック（supabase status から取得。ループバックのみ）
npm run sync:missions -- --target remote   # 環境変数で指定した Supabase（https のみ）
```

`--target` が無い場合は終了コード 1 で終了する。既定の接続先は無い。接続先はホスト名だけを表示し、キーは表示しない。

`remote` の運用資格情報（サーバーまたは CLI の環境変数。未コミットの `.env` も読む）:

- `TERMINALQUEST_CATALOG_SUPABASE_URL`
- `TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY`

これらは `VITE_` 接頭辞、`public/`、Tauri リソース、クライアントのビルドに置かない（`.env.supabase.template` 参照）。書き込みは `service_role` だけが実行できる RPC `publish_mission_catalog` を 1 回呼ぶ（1 トランザクション。同時発行は advisory lock で直列化）。内容が同じ行は更新しないため、再公開しても `updated_at` は変わらない。出力の件数（`inserted` / `updated` / `unchanged` / `retired`）で再現性を確認できる。

従来の Firestore 版は `npm run sync:missions:firestore`。

## ローカルでの検証手順

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test                           # pgTAP: 権限 (42501)、初回公開、再公開、更新、退役と復帰、不正入力
npm run sync:missions -- --target local         # 初回: inserted=12 / 97
npm run sync:missions -- --target local         # 再公開: unchanged=12 / 97
npm run supabase:catalog-check                  # HTTP: 公開キーと一般ユーザーの書き込み・RPC が 401/403、カタログ不変
npm run supabase:stop
```

`supabase:catalog-check` はローカル専用で、使い捨てユーザーを作成し、終了時に削除する。
