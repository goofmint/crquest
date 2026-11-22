-- cloud_saves: 所有者だけが読み書きでき、revision はサーバーだけが決める。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(31);

-- 構造
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cloud_saves'::regclass),
  'cloud_saves: RLS が有効'
);
SELECT ok(NOT has_table_privilege('anon', 'public.cloud_saves', 'SELECT'), 'anon: SELECT なし');
SELECT ok(NOT has_table_privilege('anon', 'public.cloud_saves', 'INSERT'), 'anon: INSERT なし');
SELECT ok(NOT has_table_privilege('authenticated', 'public.cloud_saves', 'DELETE'), 'authenticated: DELETE なし');
SELECT ok(NOT has_function_privilege('anon', 'public.upsert_cloud_save(jsonb, integer)', 'EXECUTE'), 'anon: RPC の EXECUTE なし');
SELECT ok(has_function_privilege('authenticated', 'public.upsert_cloud_save(jsonb, integer)', 'EXECUTE'), 'authenticated: RPC の EXECUTE あり');
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.cloud_saves', 'revision', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.cloud_saves', 'user_id', 'INSERT'),
  'authenticated: revision / user_id は書けない (列権限)'
);

-- ユーザー 1: 初回の書き込み
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

SELECT results_eq(
  $$SELECT revision FROM public.upsert_cloud_save('{"xp": 10}'::jsonb, 1)$$,
  $$VALUES (1::bigint)$$,
  '初回の RPC は revision 1 を返す'
);
SELECT results_eq(
  $$SELECT user_id::text, data->>'xp', schema_version FROM public.cloud_saves$$,
  $$VALUES ('00000000-0000-4000-8000-000000000001', '10', 1)$$,
  '所有者は auth.uid()、本人は自分の行を読める'
);

-- 連続書き込み: revision が単調に増え、最後の data が残る
SELECT results_eq(
  $$SELECT revision FROM public.upsert_cloud_save('{"xp": 20}'::jsonb, 1)$$,
  $$VALUES (2::bigint)$$,
  '2 回目の RPC は revision 2'
);
SELECT results_eq(
  $$SELECT revision FROM public.upsert_cloud_save('{"xp": 30, "last": true}'::jsonb, 1)$$,
  $$VALUES (3::bigint)$$,
  '3 回目の RPC は revision 3'
);
SELECT results_eq(
  $$SELECT data->>'xp', revision FROM public.cloud_saves$$,
  $$VALUES ('30', 3::bigint)$$,
  '最後の書き込みの data が保存されている'
);

-- クライアント指定の revision / updated_at / user_id は直接書けない
SELECT throws_ok(
  $$UPDATE public.cloud_saves SET revision = 999$$,
  '42501', NULL, 'revision の直接 UPDATE は拒否される'
);
SELECT throws_ok(
  $$UPDATE public.cloud_saves SET updated_at = '2000-01-01'$$,
  '42501', NULL, 'updated_at の直接 UPDATE は拒否される'
);
SELECT throws_ok(
  $$INSERT INTO public.cloud_saves (user_id, data, schema_version) VALUES ('00000000-0000-4000-8000-000000000002', '{}', 1)$$,
  '42501', NULL, '他人の user_id での INSERT は拒否される (列権限)'
);
SELECT throws_ok(
  $$UPDATE public.cloud_saves SET user_id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', NULL, '所有者の変更は拒否される'
);
SELECT throws_ok(
  $$DELETE FROM public.cloud_saves$$,
  '42501', NULL, 'DELETE は拒否される'
);
SELECT throws_ok(
  $$SELECT * FROM public.upsert_cloud_save('[1]'::jsonb, 1)$$,
  '23514', NULL, 'data がオブジェクトでなければ拒否される'
);
SELECT throws_ok(
  $$SELECT * FROM public.upsert_cloud_save('{}'::jsonb, 0)$$,
  '23514', NULL, 'schema_version が 1 未満なら拒否される'
);
SELECT throws_ok(
  $$SELECT * FROM public.upsert_cloud_save(jsonb_build_object('big', repeat('x', 2200000)), 1)$$,
  '23514', NULL, 'サイズ上限を超える data は拒否される'
);

-- ユーザー 2: 他人の行は見えず、書けず、自分の行は別に持つ
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

SELECT is((SELECT count(*)::int FROM public.cloud_saves), 0, '他人の行は見えない');
SELECT lives_ok(
  $$UPDATE public.cloud_saves SET data = '{"hacked": true}'$$,
  '他人の行の UPDATE はエラーにならず 0 行 (次の検証で内容が変わっていないことを確認する)'
);
SELECT results_eq(
  $$SELECT revision FROM public.upsert_cloud_save('{"xp": 1}'::jsonb, 1)$$,
  $$VALUES (1::bigint)$$,
  'ユーザー 2 の RPC は自分の行を作る (revision 1)'
);
SELECT results_eq(
  $$SELECT data->>'xp' FROM public.cloud_saves$$,
  $$VALUES ('1')$$,
  'ユーザー 2 は自分の行だけ見える'
);

-- ユーザー 1 の行は、ユーザー 2 の書き込みで変わっていない
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT results_eq(
  $$SELECT data->>'xp', revision FROM public.cloud_saves$$,
  $$VALUES ('30', 3::bigint)$$,
  'ユーザー 1 の行は他人の書き込みの影響を受けない'
);

-- sub なし (authenticated ロールだが auth.uid() が null)
SELECT set_config('request.jwt.claims', '{"role": "authenticated"}', true);
SELECT throws_ok(
  $$SELECT * FROM public.upsert_cloud_save('{}'::jsonb, 1)$$,
  '28000', NULL, 'auth.uid() が null の RPC は拒否される'
);
SELECT is((SELECT count(*)::int FROM public.cloud_saves), 0, 'auth.uid() が null なら行は見えない');

-- 匿名
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.cloud_saves$$, '42501', NULL, 'anon の SELECT は権限エラー');
SELECT throws_ok(
  $$SELECT * FROM public.upsert_cloud_save('{}'::jsonb, 1)$$,
  '42501', NULL, 'anon の RPC は権限エラー'
);
RESET ROLE;

-- 所有者のユーザー削除で行も消える
SELECT is(
  (SELECT count(*)::int FROM public.cloud_saves),
  2, 'postgres からは 2 行見える (RLS の対象外)'
);
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM public.cloud_saves),
  1, 'ユーザーを削除するとそのユーザーのセーブも消える'
);

SELECT * FROM finish();
ROLLBACK;
