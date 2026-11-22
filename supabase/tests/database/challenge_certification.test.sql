-- challenge_certification (Issue #189): 権限、発行、照合、期限切れ、再送、二重加点防止、貢献集計への反映。
-- 実カタログの有無に依存しないよう、専用のミッション certtest とその検証定義をフィクスチャとして投入する。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(54);

-- フィクスチャ (postgres)
INSERT INTO public.missions (id, extension, title, description, is_mission, sort_order)
VALUES ('certtest', 'test', 'Cert Test', 'd', true, 9999);
INSERT INTO public.mission_objectives (mission_id, id, title, description, xp, sort_order, retired_at) VALUES
  ('certtest', 'words', 'Words', 'd', 100, 0, NULL),
  ('certtest', 'exact', 'Exact', 'd', 50, 1, NULL),
  ('certtest', 'sum', 'Sum', 'd', 70, 2, NULL),
  ('certtest', 'retired', 'Retired', 'd', 10, 3, now()),
  ('certtest', 'nodef', 'No definition', 'd', 10, 4, NULL);
INSERT INTO catalog_private.objective_verification_definitions (mission_id, objective_id, definition_version, definition) VALUES
  ('certtest', 'words', 1, '{"method":"text_answer","normalization":"trim_lower","expected":{"words":"jah vuh skrept"},"ttl_seconds":600}'),
  ('certtest', 'exact', 1, '{"method":"text_answer","normalization":"trim","expected":{"a":"dogs","b":"hockey"}}'),
  ('certtest', 'sum', 1, '{"method":"result_vector","case_count":2,"ttl_seconds":600,"cases":[{"input":[1,2,3],"expected":6},{"input":[10,20],"expected":30},{"input":[-1,1,5],"expected":5}]}'),
  ('certtest', 'retired', 1, '{"method":"text_answer","normalization":"trim","expected":{"x":"y"}}');

CREATE TEMP TABLE ch (name text PRIMARY KEY, id uuid);
GRANT SELECT, INSERT ON ch TO authenticated, anon;

-- 構造と権限
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog_private.certification_challenges'::regclass),
  'certification_challenges: RLS が有効'
);
SELECT ok(
  NOT has_schema_privilege('anon', 'catalog_private', 'USAGE')
  AND NOT has_schema_privilege('authenticated', 'catalog_private', 'USAGE')
  AND NOT has_table_privilege('authenticated', 'catalog_private.certification_challenges', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'catalog_private.certification_challenges', 'INSERT')
  AND NOT has_table_privilege('service_role', 'catalog_private.certification_challenges', 'SELECT'),
  'チャレンジ (期待結果を含む) は一般ロールからも service_role からも直接アクセスできない'
);
SELECT ok(
  (SELECT bool_and(prosecdef AND proconfig::text LIKE '%search_path=%') FROM pg_proc WHERE oid IN (
     'public.issue_certification_challenge(text, text)'::regprocedure,
     'public.submit_certification_challenge(uuid, jsonb)'::regprocedure,
     'public.publish_verification_definitions(jsonb)'::regprocedure)),
  'RPC は SECURITY DEFINER で search_path が固定されている'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.issue_certification_challenge(text, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.submit_certification_challenge(uuid, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.issue_certification_challenge(text, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.submit_certification_challenge(uuid, jsonb)', 'EXECUTE'),
  '認定 RPC: authenticated だけが EXECUTE できる'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.publish_verification_definitions(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.publish_verification_definitions(jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.publish_verification_definitions(jsonb)', 'EXECUTE'),
  '定義の投入 RPC: service_role だけが EXECUTE できる'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'catalog_private.verify_certification_result(text, text, jsonb, jsonb)', 'EXECUTE')
  AND NOT has_schema_privilege('authenticated', 'catalog_private', 'USAGE'),
  '内部の照合関数は API ロールから呼べない'
);

-- 未認証
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge('certtest', 'words')$$, '42501', NULL, 'anon: 発行は拒否');
SELECT throws_ok(
  $$SELECT * FROM public.submit_certification_challenge('00000000-0000-4000-8000-000000000000', '{}')$$,
  '42501', NULL, 'anon: 提出は拒否');
SELECT throws_ok($$SELECT * FROM catalog_private.certification_challenges$$, '42501', NULL, 'anon: チャレンジ表を読めない');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role": "authenticated"}', true);
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge('certtest', 'words')$$, '42501', NULL, 'sub なし: 発行は拒否');
SELECT throws_ok(
  $$SELECT * FROM public.submit_certification_challenge('00000000-0000-4000-8000-000000000000', '{}')$$,
  '42501', NULL, 'sub なし: 提出は拒否');

-- ユーザー 1
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT throws_ok($$SELECT * FROM catalog_private.certification_challenges$$, '42501', NULL, 'authenticated: チャレンジ表を直接読めない');
SELECT throws_ok($$INSERT INTO catalog_private.certification_challenges (user_id, mission_id, objective_id, definition_version, method, inputs, expected, expires_at) VALUES ('00000000-0000-4000-8000-000000000001','certtest','words',1,'text_answer','{}','{}', now() + interval '1 hour')$$,
  '42501', NULL, 'authenticated: チャレンジを直接作れない');
SELECT throws_ok($$INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points) VALUES ('00000000-0000-4000-8000-000000000001','certtest','words',999)$$,
  '42501', NULL, 'authenticated: 台帳へ直接書けない');

-- 発行の拒否
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge('certtest', 'nodef')$$, 'P0001', 'objective_not_certifiable', '定義のない目標はローカル進捗のまま (発行拒否)');
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge('certtest', 'missing')$$, 'P0001', 'objective_not_certifiable', '存在しない目標は発行拒否');
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge('certtest', 'retired')$$, 'P0001', 'objective_not_certifiable', '退役した目標は発行拒否');
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge(NULL, NULL)$$, 'P0001', 'objective_not_certifiable', 'NULL は発行拒否');

-- 発行: 戻り値に期待結果を含まない
INSERT INTO ch SELECT 'words1', challenge_id FROM public.issue_certification_challenge('certtest', 'words');
INSERT INTO ch SELECT 'vec1', challenge_id FROM public.issue_certification_challenge('certtest', 'sum');
SELECT is(
  (SELECT count(*) FROM jsonb_object_keys(to_jsonb(r)) k WHERE k = 'expected')::int, 0,
  '発行の戻り値 (行) に expected キーが無い'
) FROM public.issue_certification_challenge('certtest', 'exact') r;
SELECT is((SELECT jsonb_array_length(inputs) FROM public.issue_certification_challenge('certtest', 'sum') LIMIT 1), 2,
  'result_vector は case_count 件の入力を返す');

-- 他ユーザーは使えない (ユーザー 2)
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT throws_ok(
  $$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '{"words":"jah vuh skrept"}')$$,
  'P0001', 'challenge_not_found', '他ユーザーのチャレンジは challenge_not_found');
SELECT throws_ok(
  $$SELECT * FROM public.submit_certification_challenge('00000000-0000-4000-8000-0000000000ff', '{"words":"x"}')$$,
  'P0001', 'challenge_not_found', '存在しないチャレンジも同じ challenge_not_found');

-- ユーザー 1: 形式の誤りは消費しない
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '[]')$$, '22023', NULL, '形式の誤り: 配列');
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '{}')$$, '22023', NULL, '形式の誤り: キー不足');
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '{"words":5}')$$, '22023', NULL, '形式の誤り: 文字列でない');
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '{"words":"a","extra":"b"}')$$, '22023', NULL, '形式の誤り: 余分なキー');
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), NULL)$$, '22023', NULL, '形式の誤り: NULL');
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'vec1'), '[1]')$$, '22023', NULL, '形式の誤り: 長さ違い');

-- 不正解 (型違い含む) は消費して 0 点。台帳は空のまま
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '{"words":"vuh jah skrept"}')$$,
  $$VALUES ('incorrect'::text, 0, false)$$, '不正解は incorrect / 0 点');
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words1'), '{"words":"jah vuh skrept"}')$$,
  $$VALUES ('incorrect'::text, 0, false)$$, '不正解のチャレンジは消費済み: 後から正解を送っても保存結果を返す');
INSERT INTO ch SELECT 'vec2', challenge_id FROM public.issue_certification_challenge('certtest', 'sum');
SELECT results_eq(
  $$SELECT status FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'vec2'),
      (SELECT jsonb_agg(to_jsonb((SELECT sum(x::numeric)::text FROM jsonb_array_elements_text(i) x)))
       FROM jsonb_array_elements((SELECT inputs FROM public.issue_certification_challenge('certtest','sum') LIMIT 1)) i))$$,
  $$VALUES ('incorrect'::text)$$, '型違い (数値でなく文字列) は不正解');

RESET ROLE;
SELECT is((SELECT count(*) FROM public.certified_achievements WHERE mission_id = 'certtest'), 0::bigint, '不正解では台帳行ができない');

-- 正解 (大文字・前後空白: trim_lower)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
INSERT INTO ch SELECT 'words2', challenge_id FROM public.issue_certification_challenge('certtest', 'words');
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words2'), '{"words":"  JAH vuh Skrept\n"}')$$,
  $$VALUES ('certified'::text, 100, true)$$, 'trim_lower: 大文字と前後空白を受け入れ、サーバー側の XP (100) で認定');
-- 再送: 保存結果、台帳は変わらない
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'words2'), '{"words":"jah vuh skrept"}')$$,
  $$VALUES ('certified'::text, 100, false)$$, '再送は保存結果を返し newly_certified = false');
SELECT throws_ok($$SELECT * FROM public.issue_certification_challenge('certtest', 'words')$$, 'P0001', 'already_certified', '認定済みの目標は発行拒否');

-- trim は大文字小文字を区別する
INSERT INTO ch SELECT 'exact1', challenge_id FROM public.issue_certification_challenge('certtest', 'exact');
SELECT results_eq(
  $$SELECT status FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'exact1'), '{"a":"Dogs","b":"hockey"}')$$,
  $$VALUES ('incorrect'::text)$$, 'trim: 大文字小文字を区別する');
INSERT INTO ch SELECT 'exact2', challenge_id FROM public.issue_certification_challenge('certtest', 'exact');
INSERT INTO ch SELECT 'exact3', challenge_id FROM public.issue_certification_challenge('certtest', 'exact');
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'exact2'), '{"a":" dogs ","b":"hockey\t"}')$$,
  $$VALUES ('certified'::text, 50, true)$$, 'trim: 前後空白は許容して認定 (50)');
-- 認定前に発行した別チャレンジに正解しても加点は 1 回だけ
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'exact3'), '{"a":"dogs","b":"hockey"}')$$,
  $$VALUES ('already_certified'::text, 0, false)$$, '二重加点防止: 別チャレンジの正解は already_certified / 0 点');

-- result_vector: 発行された入力から結果を計算して提出
INSERT INTO ch SELECT 'vec3', challenge_id FROM public.issue_certification_challenge('certtest', 'sum');
RESET ROLE;
CREATE TEMP TABLE vec_inputs AS
  SELECT inputs FROM catalog_private.certification_challenges WHERE id = (SELECT id FROM ch WHERE name = 'vec3');
GRANT SELECT ON vec_inputs TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'vec3'),
      (SELECT jsonb_agg((SELECT sum(x::numeric) FROM jsonb_array_elements_text(i) x)) FROM vec_inputs, jsonb_array_elements(inputs) i))$$,
  $$VALUES ('certified'::text, 70, true)$$, 'result_vector: 入力から計算した結果で認定 (70)');

-- 期限切れ (postgres で期限を過去にする)
RESET ROLE;
INSERT INTO public.mission_objectives (mission_id, id, title, description, xp, sort_order) VALUES ('certtest', 'late', 'Late', 'd', 10, 5);
INSERT INTO catalog_private.objective_verification_definitions (mission_id, objective_id, definition_version, definition)
  VALUES ('certtest', 'late', 1, '{"method":"text_answer","normalization":"trim","expected":{"x":"y"}}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
INSERT INTO ch SELECT 'late1', challenge_id FROM public.issue_certification_challenge('certtest', 'late');
RESET ROLE;
-- issued_at < expires_at の制約を保つため、両方を過去へずらす
UPDATE catalog_private.certification_challenges
SET issued_at = clock_timestamp() - interval '2 hours', expires_at = clock_timestamp() - interval '1 hour'
WHERE id = (SELECT id FROM ch WHERE name = 'late1');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT results_eq(
  $$SELECT status, points_awarded, newly_certified FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'late1'), '{"x":"y"}')$$,
  $$VALUES ('expired'::text, 0, false)$$, '期限切れは expired (正解でも認定しない)');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.certified_achievements WHERE objective_id = 'late'), 0::bigint, '期限切れでは台帳行ができない');
SELECT is((SELECT consumed_at IS NULL FROM catalog_private.certification_challenges WHERE id = (SELECT id FROM ch WHERE name = 'late1')), true,
  '期限切れのチャレンジは変更されない');

-- 退役: 発行後に目標が退役すると認定しない
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
INSERT INTO ch SELECT 'late2', challenge_id FROM public.issue_certification_challenge('certtest', 'late');
RESET ROLE;
UPDATE public.mission_objectives SET retired_at = now() WHERE mission_id = 'certtest' AND id = 'late';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT throws_ok($$SELECT * FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'late2'), '{"x":"y"}')$$,
  'P0001', 'objective_not_certifiable', '発行後に退役した目標は認定しない');
RESET ROLE;

-- trim の文字集合の回帰: 文字 v を除去しない / 垂直タブ (chr(11)) は除去する (ユーザー 3)
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
INSERT INTO ch SELECT 'vt1', challenge_id FROM public.issue_certification_challenge('certtest', 'exact');
INSERT INTO ch SELECT 'vt2', challenge_id FROM public.issue_certification_challenge('certtest', 'exact');
SELECT results_eq(
  $$SELECT status FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'vt1'), '{"a":"vdogsv","b":"vhockeyv"}')$$,
  $$VALUES ('incorrect'::text)$$, 'trim: 文字 v は除去されない (vdogsv は不正解)');
SELECT results_eq(
  $$SELECT status, points_awarded FROM public.submit_certification_challenge((SELECT id FROM ch WHERE name = 'vt2'), '{"a":"\u000bdogs\u000b","b":"\u000bhockey"}')$$,
  $$VALUES ('certified'::text, 50)$$, 'trim: 垂直タブは除去されて正解になる');
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
RESET ROLE;

-- 台帳と貢献への反映 (ユーザー 1 は 100 + 50 + 70 = 220 点)
SELECT is(
  (SELECT sum(points) FROM public.certified_achievements
   WHERE user_id = '00000000-0000-4000-8000-000000000001' AND mission_id = 'certtest'), 220::bigint,
  '台帳の点数はサーバー側のミッション定義 (xp) と一致');
SELECT is(
  (SELECT count(*) FROM public.certified_achievements
   WHERE user_id = '00000000-0000-4000-8000-000000000001' AND mission_id = 'certtest'), 3::bigint,
  '目標ごとに台帳行は 1 件だけ');
SELECT ok(
  (SELECT bool_and(certified_at <= clock_timestamp()) FROM public.certified_achievements WHERE mission_id = 'certtest'),
  'certified_at が設定されている');

INSERT INTO public.groups (id, kind, display_name, join_code)
VALUES ('00000000-0000-4000-8000-0000000000d1', 'team', 'Cert Team', 'CERTTEAM1');
-- 所属は認定より前でなければ計上されないため、所属期間を過去に作る
INSERT INTO public.group_memberships (group_id, user_id, joined_at)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', clock_timestamp() - interval '1 day');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT results_eq(
  $$SELECT total_points, achievement_count FROM public.get_group_contribution('00000000-0000-4000-8000-0000000000d1')$$,
  $$VALUES (220::bigint, 3::bigint)$$, 'get_group_contribution に認定した点数が反映される');
RESET ROLE;

-- 定義の投入 RPC (service_role)
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.publish_verification_definitions('{"definitions":[{"mission_id":"certtest","objective_id":"nodef","version":1,"definition":{"method":"nope"}}]}')$$,
  '22023', NULL, '不正な定義は 22023');
SELECT throws_ok(
  $$SELECT public.publish_verification_definitions('{"definitions":[{"mission_id":"certtest","objective_id":"retired","version":1,"definition":{"method":"text_answer","normalization":"trim","expected":{"x":"y"}}}]}')$$,
  '22023', NULL, '退役した目標への定義は 22023');
SELECT throws_ok(
  $$SELECT public.publish_verification_definitions('{"definitions":[{"mission_id":"certtest","objective_id":"nodef","version":1,"definition":{"method":"result_vector","case_count":3,"cases":[{"input":[1],"expected":1}]}}]}')$$,
  '22023', NULL, 'case_count がケース数を超える定義は 22023');
SELECT is(
  public.publish_verification_definitions('{"definitions":[{"mission_id":"certtest","objective_id":"nodef","version":1,"definition":{"method":"text_answer","normalization":"trim","expected":{"x":"y"}}}]}') ->> 'inserted',
  '1', '正しい定義は投入できる');
RESET ROLE;
SELECT is((SELECT count(*) FROM catalog_private.objective_verification_definitions), 1::bigint,
  '定義は入力の完全な集合に置き換わる (入力に無い定義は削除)');

SELECT * FROM finish();
ROLLBACK;
