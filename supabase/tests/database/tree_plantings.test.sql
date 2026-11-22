-- 植樹記録 (Issue #191): 許可リストの対象だけを、ユーザーごとに 1 回だけ記録する。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(22);

-- 構造と権限
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tree_plantings'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog_private.tree_planting_targets'::regclass),
  '両テーブルで RLS が有効'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.tree_plantings', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.tree_plantings', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.tree_plantings', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.tree_plantings', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'catalog_private.tree_planting_targets', 'SELECT'),
  '植樹記録: authenticated は SELECT のみ。許可リストは参照不可'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.record_tree_planting(text, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.record_tree_planting(text, text)', 'EXECUTE'),
  'record_tree_planting: authenticated だけが EXECUTE できる'
);
SELECT is(
  (SELECT count(*)::int FROM catalog_private.tree_planting_targets WHERE retired_at IS NULL),
  3,
  '許可リストの初期対象は 3 件'
);

-- 未認証
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1')$$, '42501', NULL, 'anon: RPC は拒否');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role": "authenticated"}', true);
SELECT throws_ok($$SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1')$$, '42501', NULL, 'JWT に sub が無い呼び出しは拒否');

-- ユーザー 1: 3 つの対象を記録できる
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT is(
  (SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1') ->> 'status'),
  'recorded', 'Fog Owl の植樹目標を記録できる'
);
SELECT is(
  (SELECT public.record_tree_planting('dev_skills', 'skills_plant_tree1') ->> 'status'),
  'recorded', 'Developer Fundamentals の植樹目標を記録できる'
);
SELECT is(
  (SELECT public.record_tree_planting('dev_skills', 'devskills_tree1') ->> 'status'),
  'recorded', 'Earth Day の木を記録できる'
);
SELECT is(
  (SELECT r ->> 'status' FROM (SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1') AS r) s),
  'already_recorded', '再送は already_recorded'
);
SELECT isnt(
  (SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1') ->> 'planted_at'), NULL,
  '再送でも planted_at を返す'
);
SELECT is((SELECT count(*)::int FROM public.tree_plantings), 3, '再送しても記録は増えない');

-- 許可リストにない対象
SELECT is((SELECT public.record_tree_planting('fog_owl', 'owl_other')  ->> 'status'), 'unsupported_target', '未知の対象は unsupported_target');
SELECT is((SELECT public.record_tree_planting('owl', 'owl_plant_tree1') ->> 'status'), 'unsupported_target', 'レガシー識別子 owl は未対応');
SELECT is((SELECT public.record_tree_planting('ctf', 'ctf_plant_tree1') ->> 'status'), 'unsupported_target', 'レガシー識別子 ctf は未対応');
SELECT is((SELECT public.record_tree_planting(NULL, 'x') ->> 'status'), 'unsupported_target', 'NULL は unsupported_target');
SELECT is((SELECT public.record_tree_planting(repeat('x', 200), 'x') ->> 'status'), 'unsupported_target', '長すぎる入力は unsupported_target');
SELECT is((SELECT count(*)::int FROM public.tree_plantings), 3, '未対応の対象は記録されない');

-- 直接の書き込み
SELECT throws_ok(
  $$INSERT INTO public.tree_plantings (user_id, mission_id, target_id) VALUES ('00000000-0000-4000-8000-000000000001', 'x', 'y')$$,
  '42501', NULL, '直接の INSERT は拒否'
);

-- ユーザー 2: 同じ対象を別に記録でき、他人の記録は見えない
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT is(
  (SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1') ->> 'status'),
  'recorded', '別のユーザーは同じ対象を記録できる'
);
SELECT is((SELECT count(*)::int FROM public.tree_plantings), 1, '他人の記録は見えない');

-- 許可リストの退役
RESET ROLE;
UPDATE catalog_private.tree_planting_targets SET retired_at = now() WHERE target_id = 'owl_plant_tree1';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
SELECT is(
  (SELECT public.record_tree_planting('fog_owl', 'owl_plant_tree1') ->> 'status'),
  'unsupported_target', '退役した対象は unsupported_target'
);

SELECT * FROM finish();
ROLLBACK;
