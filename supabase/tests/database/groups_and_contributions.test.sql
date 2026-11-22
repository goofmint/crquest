-- groups_and_contributions: 参加コード照合、重複防止、離脱、権限、チーム集計。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(46);

-- フィクスチャ (postgres で投入)。シードの固定 UUID の利用者 1〜3 を使う。
INSERT INTO public.groups (id, kind, display_name, join_code) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'team', 'Test Team', 'TESTTEAM1'),
  ('00000000-0000-4000-8000-0000000000c2', 'operation', 'Test Operation', 'TESTOPS01');

-- 構造と権限
SELECT ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
   WHERE oid IN ('public.groups'::regclass, 'public.group_memberships'::regclass,
                 'public.certified_achievements'::regclass)),
  '3 テーブルとも RLS が有効'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.groups', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.group_memberships', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.certified_achievements', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.groups', 'SELECT'),
  'テーブル権限が authenticated / anon にない'
);
SELECT ok(
  (SELECT bool_and(prosecdef AND proconfig::text LIKE '%search_path=%')
   FROM pg_proc WHERE oid IN (
     'public.join_group(public.group_kind, text)'::regprocedure,
     'public.leave_group(uuid)'::regprocedure,
     'public.list_my_groups(public.group_kind)'::regprocedure,
     'public.get_group_contribution(uuid)'::regprocedure)),
  'RPC は SECURITY DEFINER で search_path が固定されている'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.join_group(public.group_kind, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.leave_group(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.list_my_groups(public.group_kind)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_group_contribution(uuid)', 'EXECUTE'),
  'anon: RPC の EXECUTE なし'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.join_group(public.group_kind, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.leave_group(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.list_my_groups(public.group_kind)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_group_contribution(uuid)', 'EXECUTE'),
  'authenticated: RPC の EXECUTE あり'
);

-- 制約 (postgres)
SELECT throws_ok(
  $$INSERT INTO public.groups (kind, display_name, join_code) VALUES ('team', 'X', 'lower123')$$,
  '23514', NULL, '小文字の join_code は保存できない'
);
SELECT throws_ok(
  $$INSERT INTO public.groups (kind, display_name, join_code) VALUES ('team', 'X', 'SHORT')$$,
  '23514', NULL, '6 文字未満の join_code は保存できない'
);
SELECT throws_ok(
  $$INSERT INTO public.groups (kind, display_name, join_code) VALUES ('team', 'X', 'TESTTEAM1')$$,
  '23505', NULL, '(kind, join_code) は一意'
);
SELECT lives_ok(
  $$INSERT INTO public.groups (kind, display_name, join_code) VALUES ('operation', 'X', 'TESTTEAM1')$$,
  '別の kind なら同じコードを使える'
);
DELETE FROM public.groups WHERE display_name = 'X';

-- 未認証
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', 'TESTTEAM1')$$,
  '42501', NULL, 'anon: join_group は拒否'
);
SELECT throws_ok(
  $$SELECT * FROM public.list_my_groups()$$,
  '42501', NULL, 'anon: list_my_groups は拒否'
);
RESET ROLE;

-- sub のない claims
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role": "authenticated"}', true);
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', 'TESTTEAM1')$$,
  '42501', NULL, 'sub なし: join_group は拒否'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c1')$$,
  '42501', NULL, 'sub なし: get_group_contribution は拒否'
);

-- ユーザー 1
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

SELECT results_eq(
  $$SELECT group_id::text, kind::text, display_name, join_code FROM public.join_group('team', '  testteam1 ')$$,
  $$VALUES ('00000000-0000-4000-8000-0000000000c1', 'team', 'Test Team', 'TESTTEAM1')$$,
  '小文字・前後空白のコードでも加入できる'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', 'TESTTEAM1')$$,
  'P0001', 'already_member', '重複加入は already_member'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', 'NOSUCH123')$$,
  'P0001', 'invalid_join_code', '存在しないコードは invalid_join_code'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', 'TESTOPS01')$$,
  'P0001', 'invalid_join_code', 'kind の違うコードは invalid_join_code'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', '')$$,
  'P0001', 'invalid_join_code', '空コードは invalid_join_code'
);
SELECT throws_ok(
  $$SELECT * FROM public.join_group('team', NULL)$$,
  'P0001', 'invalid_join_code', 'NULL コードは invalid_join_code'
);
SELECT lives_ok(
  $$SELECT * FROM public.join_group('operation', 'TESTOPS01')$$,
  'チームとオペレーションは独立して所属できる'
);
SELECT results_eq(
  $$SELECT kind::text, display_name FROM public.list_my_groups() ORDER BY kind$$,
  $$VALUES ('operation', 'Test Operation'), ('team', 'Test Team')$$,
  '一覧に自分の所属が出る'
);
SELECT results_eq(
  $$SELECT display_name FROM public.list_my_groups('operation')$$,
  $$VALUES ('Test Operation')$$,
  '一覧を kind で絞り込める'
);

-- 直接アクセスは拒否
SELECT throws_ok($$SELECT * FROM public.groups$$, '42501', NULL, 'groups の直接 SELECT は拒否');
SELECT throws_ok($$SELECT * FROM public.group_memberships$$, '42501', NULL, 'group_memberships の直接 SELECT は拒否');
SELECT throws_ok($$SELECT * FROM public.certified_achievements$$, '42501', NULL, '台帳の直接 SELECT は拒否');
SELECT throws_ok(
  $$INSERT INTO public.group_memberships (group_id, user_id) VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000002')$$,
  '42501', NULL, 'group_memberships の直接 INSERT は拒否'
);
SELECT throws_ok(
  $$UPDATE public.group_memberships SET left_at = now()$$,
  '42501', NULL, 'group_memberships の直接 UPDATE は拒否'
);
SELECT throws_ok(
  $$INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points) VALUES ('00000000-0000-4000-8000-000000000001', 'm', 'o', 100)$$,
  '42501', NULL, '台帳への INSERT は拒否'
);

-- ユーザー 2: 他ユーザーの所属は操作できない
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.leave_group('00000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'not_member', '他ユーザーだけが所属するグループから離脱できない'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'not_member', '非メンバーは集計を取得できない'
);
SELECT is_empty($$SELECT * FROM public.list_my_groups()$$, '他ユーザーの所属は一覧に出ない');
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.group_memberships
   WHERE user_id = '00000000-0000-4000-8000-000000000001' AND left_at IS NULL),
  2::bigint,
  '拒否された離脱でユーザー 1 の所属は変わらない'
);

-- 集計: 所属履歴と台帳を明示的な時刻で投入する (同一トランザクションでは now() が変わらないため)
DELETE FROM public.group_memberships;
INSERT INTO public.group_memberships (group_id, user_id, joined_at, left_at) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', '2026-01-10 00:00+00', '2026-01-20 00:00+00'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', '2026-02-01 00:00+00', NULL),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000002', '2026-01-01 00:00+00', NULL),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', NULL);
INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points, certified_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'm1', 'before', 1,    '2026-01-05 00:00+00'), -- 加入前
  ('00000000-0000-4000-8000-000000000001', 'm1', 'in1',    10,   '2026-01-10 00:00+00'), -- 加入時刻ちょうど (含む)
  ('00000000-0000-4000-8000-000000000001', 'm1', 'in2',    20,   '2026-01-15 00:00+00'), -- 所属中、離脱後も残る
  ('00000000-0000-4000-8000-000000000001', 'm1', 'gap',    100,  '2026-01-20 00:00+00'), -- 離脱時刻ちょうど (含まない)
  ('00000000-0000-4000-8000-000000000001', 'm1', 'gap2',   1000, '2026-01-25 00:00+00'), -- 離脱中
  ('00000000-0000-4000-8000-000000000001', 'm1', 'in3',    5,    '2026-02-10 00:00+00'), -- 再加入後
  ('00000000-0000-4000-8000-000000000002', 'm1', 'in1',    7,    '2026-01-12 00:00+00'),
  ('00000000-0000-4000-8000-000000000003', 'm1', 'in1',    10000,'2026-01-12 00:00+00'); -- 非メンバー

SELECT throws_ok(
  $$INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points) VALUES ('00000000-0000-4000-8000-000000000003', 'm1', 'in1', 1)$$,
  '23505', NULL, '台帳の (user, mission, objective) は一意'
);
SELECT throws_ok(
  $$INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points) VALUES ('00000000-0000-4000-8000-000000000003', 'm2', 'x', -1)$$,
  '23514', NULL, '負の points は保存できない'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT results_eq(
  $$SELECT total_points, achievement_count, contributor_count FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c1')$$,
  $$VALUES (42::bigint, 4::bigint, 2::bigint)$$,
  'チーム集計: 加入前・離脱中を除き、離脱前に得た分は残す (10+20+5+7)'
);
SELECT results_eq(
  $$SELECT total_points, achievement_count, contributor_count FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c2')$$,
  $$VALUES (1136::bigint, 6::bigint, 1::bigint)$$,
  'オペレーション集計: 1 つの達成は認定時に所属していたすべてのグループに計上'
);
SELECT results_eq(
  $$SELECT count(*)::int FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c1')$$,
  $$VALUES (1)$$,
  '集計は 1 行だけ返し、ユーザー別の内訳を含まない'
);

-- ユーザー 2 が離脱しても、所属中に得た貢献はチームに残る
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.leave_group('00000000-0000-4000-8000-0000000000c1')$$,
  '本人は離脱できる'
);
SELECT throws_ok(
  $$SELECT public.leave_group('00000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'not_member', '2 回目の離脱は not_member'
);
SELECT is_empty($$SELECT * FROM public.list_my_groups()$$, '離脱後は一覧から消える');
SELECT throws_ok(
  $$SELECT * FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'not_member', '離脱後は集計を取得できない'
);
SELECT lives_ok(
  $$SELECT * FROM public.join_group('team', 'TESTTEAM1')$$,
  '離脱後に再加入できる'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.group_memberships
   WHERE user_id = '00000000-0000-4000-8000-000000000002'
     AND group_id = '00000000-0000-4000-8000-0000000000c1'),
  2::bigint,
  '離脱で行は削除されず、再加入は新しい行になる'
);
SELECT is(
  (SELECT count(*) FROM public.group_memberships
   WHERE user_id = '00000000-0000-4000-8000-000000000002'
     AND group_id = '00000000-0000-4000-8000-0000000000c1' AND left_at IS NULL),
  1::bigint,
  'アクティブな所属は 1 行だけ'
);

-- ユーザー 1 の視点で、ユーザー 2 の離脱後も貢献 (7) が残る
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT results_eq(
  $$SELECT total_points FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000c1')$$,
  $$VALUES (42::bigint)$$,
  '離脱・再加入後も所属中に得た貢献は変わらない'
);
SELECT lives_ok(
  $$SELECT public.leave_group('00000000-0000-4000-8000-0000000000c2')$$,
  'ユーザー 1 もオペレーションから離脱できる'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
