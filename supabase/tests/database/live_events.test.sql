-- live_events: 参加資格、受付期間、期間境界、未認定の除外、個人・チーム集計、同点・ページング、公開項目、権限。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(62);

-- ===== フィクスチャ (postgres で投入) =====
-- シードの利用者 1〜3 に加え、利用者 4・5 と、ページング用の大量の利用者を作る。
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'le-4@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'le-5@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'le-6@example.test', now(), now());
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
       'le-bulk-' || n || '@example.test', now(), now()
FROM generate_series(1, 105) n;

INSERT INTO public.groups (id, kind, display_name, join_code) VALUES
  ('00000000-0000-4000-8000-0000000001a1', 'team', 'Team Alpha', 'LETEAMA01'),
  ('00000000-0000-4000-8000-0000000001a2', 'team', 'Team Bravo', 'LETEAMB01'),
  ('00000000-0000-4000-8000-0000000001a3', 'team', 'Team Idle', 'LETEAMI01'),
  ('00000000-0000-4000-8000-0000000001b1', 'operation', 'Ops Gate', 'LEOPS0001');

INSERT INTO public.live_events (id, title, starts_at, ends_at, status, required_group_id) VALUES
  -- 通常: 開催中
  ('00000000-0000-4000-8000-0000000002e1', 'Active', now() - interval '10 days', now() + interval '10 days', 'published', NULL),
  ('00000000-0000-4000-8000-0000000002e2', 'Draft', now() - interval '10 days', now() + interval '10 days', 'draft', NULL),
  ('00000000-0000-4000-8000-0000000002e3', 'Ended', now() - interval '20 days', now() - interval '10 days', 'published', NULL),
  ('00000000-0000-4000-8000-0000000002e4', 'Gated', now() - interval '10 days', now() + interval '10 days', 'published',
   '00000000-0000-4000-8000-0000000001b1'),
  -- 境界テスト: 固定の過去期間 [2026-03-01, 2026-03-02)
  ('00000000-0000-4000-8000-0000000002e5', 'Boundary', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z', 'published', NULL),
  -- 同点・チーム集計
  ('00000000-0000-4000-8000-0000000002e6', 'Ties', now() - interval '10 days', now() + interval '10 days', 'published', NULL),
  -- ページング
  ('00000000-0000-4000-8000-0000000002e7', 'Bulk', now() - interval '10 days', now() + interval '10 days', 'published', NULL);

-- 構造と権限
SELECT ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
   WHERE oid IN ('public.live_events'::regclass, 'public.live_event_participants'::regclass)),
  '2 テーブルとも RLS が有効'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.live_events', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.live_event_participants', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.live_event_participants', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.live_events', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.live_event_participants', 'SELECT'),
  'テーブル権限が authenticated / anon にない'
);
SELECT ok(
  (SELECT bool_and(prosecdef AND proconfig::text LIKE '%search_path=%')
   FROM pg_proc WHERE oid IN (
     'public.list_live_events()'::regprocedure,
     'public.get_live_event_ranking(uuid, integer, integer)'::regprocedure,
     'public.get_live_event_team_ranking(uuid, integer, integer)'::regprocedure,
     'public.join_live_event(uuid, text, boolean)'::regprocedure,
     'public.update_live_event_participation(uuid, text, boolean)'::regprocedure,
     'public.get_my_live_event_status(uuid)'::regprocedure)),
  'RPC は SECURITY DEFINER で search_path が固定されている'
);
SELECT ok(
  has_function_privilege('anon', 'public.list_live_events()', 'EXECUTE')
  AND has_function_privilege('anon', 'public.get_live_event_ranking(uuid, integer, integer)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.get_live_event_team_ranking(uuid, integer, integer)', 'EXECUTE'),
  'anon: 公開 RPC を実行できる'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.join_live_event(uuid, text, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.update_live_event_participation(uuid, text, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_my_live_event_status(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.join_live_event(uuid, text, boolean)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_my_live_event_status(uuid)', 'EXECUTE'),
  '参加・本人向け RPC は authenticated のみ'
);
SELECT ok(
  NOT has_function_privilege('anon', 'ranking_private.participant_scores(uuid, timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'ranking_private.team_scores(uuid, timestamptz)', 'EXECUTE')
  AND NOT has_schema_privilege('authenticated', 'ranking_private', 'USAGE'),
  '集計の補助関数とスキーマは API 非公開'
);

-- 制約 (postgres)
SELECT throws_ok(
  $$INSERT INTO public.live_events (title, starts_at, ends_at) VALUES ('X', now(), now())$$,
  '23514', NULL, 'ends_at は starts_at より後'
);
SELECT throws_ok(
  $$INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking)
    VALUES ('00000000-0000-4000-8000-0000000002e1', '00000000-0000-4000-8000-000000000001', E'a\nb', true)$$,
  '23514', NULL, '制御文字を含む表示名は保存できない'
);
SELECT throws_ok(
  $$INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking)
    VALUES ('00000000-0000-4000-8000-0000000002e1', '00000000-0000-4000-8000-000000000001', repeat('x', 33), true)$$,
  '23514', NULL, '33 文字の表示名は保存できない'
);

-- ===== 未認証 =====
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', 'Anon', true)$$,
  '42501', NULL, 'anon: 参加は実行できない'
);
SELECT lives_ok($$SELECT * FROM public.list_live_events()$$, 'anon: イベント一覧を取得できる');
SELECT lives_ok(
  $$SELECT * FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e1')$$,
  'anon: ランキングを取得できる'
);
SELECT throws_ok($$SELECT * FROM public.live_events$$, '42501', NULL, 'anon: live_events の直接 SELECT は拒否');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role": "authenticated"}', true);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', 'NoSub', true)$$,
  '42501', NULL, 'sub なし: 参加は拒否'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_my_live_event_status('00000000-0000-4000-8000-0000000002e1')$$,
  '42501', NULL, 'sub なし: 自分の状況は拒否'
);

-- ===== 参加資格 (利用者 1) =====
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

SELECT throws_ok($$SELECT * FROM public.live_events$$, '42501', NULL, 'authenticated: live_events の直接 SELECT は拒否');
SELECT throws_ok($$SELECT * FROM public.live_event_participants$$, '42501', NULL, 'authenticated: 参加記録の直接 SELECT は拒否');
SELECT throws_ok(
  $$INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking)
    VALUES ('00000000-0000-4000-8000-0000000002e1', '00000000-0000-4000-8000-000000000001', 'Direct', true)$$,
  '42501', NULL, 'authenticated: 参加記録に直接書き込めない'
);
SELECT throws_ok(
  $$INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points)
    VALUES ('00000000-0000-4000-8000-000000000001', 'm', 'o', 100)$$,
  '42501', NULL, 'authenticated: 台帳に直接書き込めない'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e2', 'Draft', true)$$,
  'P0001', 'event_not_found', '下書きのイベントは event_not_found'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-00000000ffff', 'None', true)$$,
  'P0001', 'event_not_found', '存在しないイベントも event_not_found'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e3', 'Late', true)$$,
  'P0001', 'event_closed', '終了後の参加は event_closed'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e4', 'Gate', true)$$,
  'P0001', 'not_eligible', '必須グループの非メンバーは not_eligible'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', '   ', true)$$,
  'P0001', 'invalid_display_name', '空白だけの表示名は invalid_display_name'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', NULL, true)$$,
  'P0001', 'invalid_display_name', 'NULL の表示名は invalid_display_name'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', repeat('x', 33), true)$$,
  'P0001', 'invalid_display_name', '33 文字の表示名は invalid_display_name'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', E'bad\tname', true)$$,
  'P0001', 'invalid_display_name', '制御文字を含む表示名は invalid_display_name'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', E'a‮b', true)$$,
  'P0001', 'invalid_display_name', '双方向制御文字を含む表示名は invalid_display_name'
);
SELECT results_eq(
  $$SELECT display_name, show_in_ranking FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', '  Alice  ', true)$$,
  $$VALUES ('Alice', true)$$,
  '参加できる (表示名は前後の空白を除いて保存される)'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e1', 'Alice2', true)$$,
  'P0001', 'already_participant', '二重参加は already_participant'
);
SELECT results_eq(
  $$SELECT joined, display_name, show_in_ranking, score, rank FROM public.get_my_live_event_status('00000000-0000-4000-8000-0000000002e1')$$,
  $$VALUES (true, 'Alice', true, 0::bigint, 1::bigint)$$,
  '自分の状況: 参加済み、0 点、1 位'
);
SELECT results_eq(
  $$SELECT joined, display_name, score, rank FROM public.get_my_live_event_status('00000000-0000-4000-8000-0000000002e6')$$,
  $$VALUES (false, NULL::text, 0::bigint, NULL::bigint)$$,
  '自分の状況: 未参加'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_my_live_event_status('00000000-0000-4000-8000-0000000002e2')$$,
  'P0001', 'event_not_found', '下書きの状況は event_not_found'
);
SELECT throws_ok(
  $$SELECT * FROM public.update_live_event_participation('00000000-0000-4000-8000-0000000002e6', 'X', NULL)$$,
  'P0001', 'not_participant', '未参加の更新は not_participant'
);
SELECT throws_ok(
  $$SELECT * FROM public.update_live_event_participation('00000000-0000-4000-8000-0000000002e1', '', NULL)$$,
  'P0001', 'invalid_display_name', '更新でも表示名を検証する'
);
SELECT results_eq(
  $$SELECT display_name, show_in_ranking FROM public.update_live_event_participation('00000000-0000-4000-8000-0000000002e1', 'Alice B', false)$$,
  $$VALUES ('Alice B', false)$$,
  '表示名と表示の可否を更新できる'
);
SELECT results_eq(
  $$SELECT show_in_ranking, rank FROM public.get_my_live_event_status('00000000-0000-4000-8000-0000000002e1')$$,
  $$VALUES (false, NULL::bigint)$$,
  '非表示の参加者には順位を返さない'
);
-- 必須グループのメンバーは参加できる
RESET ROLE;
INSERT INTO public.group_memberships (group_id, user_id, joined_at)
VALUES ('00000000-0000-4000-8000-0000000001b1', '00000000-0000-4000-8000-000000000001', now() - interval '1 day');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT lives_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e4', 'Gate', true)$$,
  '必須グループのアクティブなメンバーは参加できる'
);
RESET ROLE;
UPDATE public.group_memberships SET left_at = now()
WHERE group_id = '00000000-0000-4000-8000-0000000001b1';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT throws_ok(
  $$SELECT * FROM public.join_live_event('00000000-0000-4000-8000-0000000002e4', 'Gate2', true)$$,
  'P0001', 'not_eligible', 'メンバーでない利用者 (離脱済みを含む) は参加できない'
);
RESET ROLE;

-- ===== 期間境界 (Boundary: [2026-03-01, 2026-03-02)) =====
-- 利用者 1: 開始前に参加 (計上は開始から)。利用者 2: 期間の途中で参加 (計上は参加から)。
INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking, joined_at) VALUES
  ('00000000-0000-4000-8000-0000000002e5', '00000000-0000-4000-8000-000000000001', 'EarlyBird', true, '2026-02-28T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000002e5', '00000000-0000-4000-8000-000000000002', 'MidJoiner', true, '2026-03-01T12:00:00Z');
INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points, certified_at) VALUES
  -- 利用者 1
  ('00000000-0000-4000-8000-000000000001', 'b', 'before_start', 1000, '2026-03-01T00:00:00Z'::timestamptz - interval '1 microsecond'),
  ('00000000-0000-4000-8000-000000000001', 'b', 'at_start', 10, '2026-03-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000001', 'b', 'last_instant', 100, '2026-03-02T00:00:00Z'::timestamptz - interval '1 microsecond'),
  ('00000000-0000-4000-8000-000000000001', 'b', 'at_end', 2000, '2026-03-02T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000001', 'b', 'after_end', 4000, '2026-03-05T00:00:00Z'),
  -- 利用者 2: 参加 (12:00) より前は除外、ちょうどは計上
  ('00000000-0000-4000-8000-000000000002', 'b', 'before_join', 5000, '2026-03-01T11:59:59Z'),
  ('00000000-0000-4000-8000-000000000002', 'b', 'at_join', 7, '2026-03-01T12:00:00Z'),
  -- 利用者 4: 参加していないので除外
  ('00000000-0000-4000-8000-000000000004', 'b', 'not_participant', 9999, '2026-03-01T06:00:00Z');
-- 利用者 3 のクラウドセーブ (自己申告の XP と完了目標) は集計に影響しない
INSERT INTO public.cloud_saves (user_id, data, schema_version)
VALUES ('00000000-0000-4000-8000-000000000003',
        '{"xp": 123456, "completedObjectives": {"b": {"before_start": true}}}', 1);
INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking, joined_at)
VALUES ('00000000-0000-4000-8000-0000000002e5', '00000000-0000-4000-8000-000000000003', 'SaveCheater', true, '2026-02-28T00:00:00Z');

SET LOCAL ROLE anon;
SELECT results_eq(
  $$SELECT rank, display_name, score, achievement_count, total_count
    FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e5')
    ORDER BY rank, display_name$$,
  $$VALUES (1::bigint, 'EarlyBird', 110::bigint, 2::bigint, 3::bigint),
           (2::bigint, 'MidJoiner', 7::bigint, 1::bigint, 3::bigint),
           (3::bigint, 'SaveCheater', 0::bigint, 0::bigint, 3::bigint)$$,
  '開始ちょうど・終了直前は計上、開始前・終了ちょうど・終了後・参加前は除外、セーブは使わない'
);
RESET ROLE;

-- 将来時刻の行 (開催中イベント) は除外される
INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking, joined_at)
VALUES ('00000000-0000-4000-8000-0000000002e1', '00000000-0000-4000-8000-000000000006', 'Bob', true, now() - interval '5 days');
INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points, certified_at) VALUES
  ('00000000-0000-4000-8000-000000000006', 'f', 'future', 777, now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000000006', 'f', 'past', 3, now() - interval '1 hour');
SET LOCAL ROLE anon;
SELECT results_eq(
  $$SELECT display_name, score FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e1')$$,
  $$VALUES ('Bob', 3::bigint)$$,
  '将来時刻の行は除外される (Alice は非表示)'
);
RESET ROLE;

-- 二重提出: 同じ台帳行の再投入は一意制約で拒否され、スコアは変わらない
SELECT throws_ok(
  $$INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points)
    VALUES ('00000000-0000-4000-8000-000000000006', 'f', 'past', 3)$$,
  '23505', NULL, '同一の達成の再投入は 23505'
);
SET LOCAL ROLE anon;
SELECT results_eq(
  $$SELECT score FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e1')$$,
  $$VALUES (3::bigint)$$,
  '再投入の後もスコアは変わらない'
);
RESET ROLE;

-- ===== 同点とチーム集計 (Ties) =====
INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking, joined_at) VALUES
  ('00000000-0000-4000-8000-0000000002e6', '00000000-0000-4000-8000-000000000001', 'Alpha', true, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000002e6', '00000000-0000-4000-8000-000000000002', 'Bravo', true, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000002e6', '00000000-0000-4000-8000-000000000003', 'Charlie', true, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000002e6', '00000000-0000-4000-8000-000000000004', 'Hidden', false, now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000002e6', '00000000-0000-4000-8000-000000000005', 'Echo', true, now() - interval '5 days');
INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points, certified_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 't', 'a1', 30, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000001', 't', 'a2', 20, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000002', 't', 'b1', 50, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000003', 't', 'c1', 10, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000004', 't', 'h1', 999, now() - interval '1 day');
-- 所属: 利用者 1 は Alpha。利用者 2 は Alpha を 3 日前に離脱し、2 日前から Bravo。
-- 利用者 3 は Alpha と Bravo の両方。利用者 4 は Alpha で、重複した所属履歴 (閉じた行と現在の行) を持つ。利用者 5 は無所属。
INSERT INTO public.group_memberships (group_id, user_id, joined_at, left_at) VALUES
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000001', now() - interval '8 days', NULL),
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000002', now() - interval '8 days', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-000000000002', now() - interval '2 days', NULL),
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000003', now() - interval '8 days', NULL),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-000000000003', now() - interval '8 days', NULL),
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000004', now() - interval '9 days', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000004', now() - interval '8 days', NULL),
  ('00000000-0000-4000-8000-0000000001b1', '00000000-0000-4000-8000-000000000001', now() - interval '8 days', NULL);

SET LOCAL ROLE anon;
SELECT results_eq(
  $$SELECT rank, display_name, score, achievement_count, total_count
    FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e6')$$,
  $$VALUES (1::bigint, 'Alpha', 50::bigint, 2::bigint, 4::bigint),
           (1::bigint, 'Bravo', 50::bigint, 1::bigint, 4::bigint),
           (3::bigint, 'Charlie', 10::bigint, 1::bigint, 4::bigint),
           (4::bigint, 'Echo', 0::bigint, 0::bigint, 4::bigint)$$,
  '個人: 同点は 1, 1, 3、非表示は除外、0 点の表示参加者は含む、同点内は内部 ID 順'
);
SELECT results_eq(
  $$SELECT rank, display_name, score, achievement_count, total_count
    FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e6', 2, 1)$$,
  $$VALUES (1::bigint, 'Bravo', 50::bigint, 1::bigint, 4::bigint),
           (3::bigint, 'Charlie', 10::bigint, 1::bigint, 4::bigint)$$,
  '個人: limit / offset でページングでき、総件数は全体の件数'
);
SELECT results_eq(
  $$SELECT rank, display_name, score, achievement_count, contributor_count, total_count
    FROM public.get_live_event_team_ranking('00000000-0000-4000-8000-0000000002e6')$$,
  $$VALUES (1::bigint, 'Team Alpha', 1059::bigint, 4::bigint, 3::bigint, 2::bigint),
           (2::bigint, 'Team Bravo', 60::bigint, 2::bigint, 2::bigint, 2::bigint)$$,
  'チーム: 離脱後の達成は除外、重複した所属履歴は二重計上しない、複数チームは各チームに計上、非表示参加者も計上、達成のないチームと操作は除外'
);
SELECT results_eq(
  $$SELECT display_name, score FROM public.get_live_event_team_ranking('00000000-0000-4000-8000-0000000002e6', 1, 1)$$,
  $$VALUES ('Team Bravo', 60::bigint)$$,
  'チーム: ページング'
);
SELECT is_empty(
  $$SELECT * FROM public.get_live_event_team_ranking('00000000-0000-4000-8000-0000000002e5')$$,
  '所属のない参加者だけのイベントはチームランキングが空'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e2')$$,
  'P0001', 'event_not_found', '下書きのランキングは event_not_found'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_live_event_team_ranking('00000000-0000-4000-8000-00000000ffff')$$,
  'P0001', 'event_not_found', '存在しないイベントのチームランキングは event_not_found'
);
RESET ROLE;

-- 離脱前の達成はチームに残る (チームの所属期間は達成時刻で判定)。利用者 2 の Alpha 在籍中の達成を追加する。
INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points, certified_at)
VALUES ('00000000-0000-4000-8000-000000000002', 't', 'b_early', 5, now() - interval '4 days');
SET LOCAL ROLE anon;
SELECT results_eq(
  $$SELECT display_name, score FROM public.get_live_event_team_ranking('00000000-0000-4000-8000-0000000002e6') ORDER BY rank$$,
  $$VALUES ('Team Alpha', 1064::bigint), ('Team Bravo', 60::bigint)$$,
  'チーム: 在籍中の達成は離脱後も Alpha に残る'
);
RESET ROLE;

-- ===== ページングの丸め (Bulk: 105 人) =====
INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking, joined_at)
SELECT '00000000-0000-4000-8000-0000000002e7', ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid,
       'P' || n, true, now() - interval '1 day'
FROM generate_series(1, 105) n;
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e7', 1000, 0)),
  100, 'limit の上限は 100'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e7')),
  50, 'limit の既定は 50'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e7', 0, 0)),
  1, 'limit の下限は 1'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e7', 100, -5)),
  100, '負の offset は 0 として扱う'
);
SELECT results_eq(
  $$SELECT count(*)::int, max(total_count)::int FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e7', 100, 100)$$,
  $$VALUES (5, 105)$$,
  '最後のページは残りの件数で、総件数は 105'
);
SELECT results_eq(
  $$SELECT DISTINCT rank FROM public.get_live_event_ranking('00000000-0000-4000-8000-0000000002e7', 100, 0)$$,
  $$VALUES (1::bigint)$$,
  '全員 0 点なら全員 1 位'
);

-- ===== イベント一覧と公開項目 =====
SELECT results_eq(
  $$SELECT title, phase, is_open FROM public.list_live_events() WHERE title IN ('Active', 'Ended', 'Draft', 'Gated') ORDER BY title$$,
  $$VALUES ('Active', 'active', true), ('Ended', 'ended', false), ('Gated', 'active', true)$$,
  '一覧: 公開中のみ (下書きは含まない)、phase と受付中の判定'
);
RESET ROLE;

SELECT is(
  (SELECT proargnames FROM pg_proc WHERE oid = 'public.get_live_event_ranking(uuid, integer, integer)'::regprocedure)::text,
  '{p_event_id,p_limit,p_offset,rank,display_name,score,achievement_count,total_count}',
  '個人ランキングの返却列は公開項目だけ'
);
SELECT is(
  (SELECT proargnames FROM pg_proc WHERE oid = 'public.get_live_event_team_ranking(uuid, integer, integer)'::regprocedure)::text,
  '{p_event_id,p_limit,p_offset,rank,display_name,score,achievement_count,contributor_count,total_count}',
  'チームランキングの返却列は公開項目だけ'
);
SELECT is(
  (SELECT proargnames FROM pg_proc WHERE oid = 'public.list_live_events()'::regprocedure)::text,
  '{event_id,title,starts_at,ends_at,phase,is_open}',
  'イベント一覧の返却列は公開項目だけ (required_group_id を含まない)'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS n
    WHERE p.proname IN ('list_live_events', 'get_live_event_ranking', 'get_live_event_team_ranking')
      AND p.pronamespace = 'public'::regnamespace
      AND (n ~* 'user_id|email|join_code|group_id|save|token|meta')
  ),
  '公開 RPC の列名に user_id・メール・参加コード・グループ ID・セーブ・トークンを含まない'
);

SELECT * FROM finish();
ROLLBACK;
