-- 解除コード (Issue #191): サーバーで照合し、アカウントごとに 1 回だけ記録する。
-- コードは supabase/seed.sql の合成データ (TQ-TEST-*) を使う。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(42);

-- 構造と権限
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.unlock_code_redemptions'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog_private.unlock_codes'::regclass),
  '両テーブルで RLS が有効'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.unlock_code_redemptions', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.unlock_code_redemptions', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.unlock_code_redemptions', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.unlock_code_redemptions', 'DELETE'),
  '付与記録: anon は不可、authenticated は SELECT のみ'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'catalog_private.unlock_codes', 'SELECT')
  AND NOT has_table_privilege('anon', 'catalog_private.unlock_codes', 'SELECT')
  AND NOT has_schema_privilege('authenticated', 'catalog_private', 'USAGE'),
  'コード対応表: 一般ロールは参照できない'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.redeem_unlock_code(text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.redeem_unlock_code(text)', 'EXECUTE'),
  'redeem_unlock_code: authenticated だけが EXECUTE できる'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.publish_unlock_codes(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.publish_unlock_codes(jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.publish_unlock_codes(jsonb)', 'EXECUTE'),
  'publish_unlock_codes: service_role だけが EXECUTE できる'
);

-- 未認証
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.redeem_unlock_code('TQ-TEST-WAND')$$, '42501', NULL, 'anon: RPC は拒否');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role": "authenticated"}', true);
SELECT throws_ok($$SELECT public.redeem_unlock_code('TQ-TEST-WAND')$$, '42501', NULL, 'JWT に sub が無い呼び出しは拒否');

-- ユーザー 1
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

SELECT is(
  (SELECT (r ->> 'status') || ':' || (r ->> 'item_key') FROM (SELECT public.redeem_unlock_code('TQ-TEST-WAND') AS r) s),
  'redeemed:wand',
  '有効コード: redeemed と item_key'
);
SELECT isnt(
  (SELECT public.redeem_unlock_code('TQ-TEST-WAND') ->> 'redeemed_at'), NULL,
  '再送でも redeemed_at を返す'
);
SELECT is(
  (SELECT (r ->> 'status') || ':' || (r ->> 'item_key') FROM (SELECT public.redeem_unlock_code('TQ-TEST-WAND') AS r) s),
  'already_redeemed:wand',
  '再送: already_redeemed と最初の item_key (ローカル付与の修復用)'
);
SELECT is(
  (SELECT count(*)::int FROM public.unlock_code_redemptions),
  1,
  '再送しても付与記録は 1 件'
);
SELECT is(
  (SELECT public.redeem_unlock_code('  TQ-TEST-TSHIRT ' || E'\n') ->> 'status'),
  'redeemed',
  '前後の空白は除去して照合する'
);
SELECT is(
  (SELECT public.redeem_unlock_code(E'\u00A0\u3000TQ-TEST-TSHIRT\uFEFF\u2003') ->> 'status'),
  'already_redeemed',
  'Unicode の空白 (NBSP、全角、BOM、em space) も前後から除去して照合する'
);
SELECT is(
  (SELECT public.redeem_unlock_code('tq-test-wand') ->> 'status'),
  'invalid_code',
  '大文字と小文字は区別する'
);
SELECT is(
  (SELECT public.redeem_unlock_code('NO-SUCH-CODE') ->> 'status'),
  'invalid_code',
  '未登録のコードは invalid_code'
);
SELECT is(
  (SELECT public.redeem_unlock_code('NO-SUCH-CODE') -> 'item_key'),
  'null'::jsonb,
  '無効コードは item_key を返さない'
);
SELECT is((SELECT public.redeem_unlock_code('') ->> 'status'), 'invalid_code', '空コードは invalid_code');
SELECT is((SELECT public.redeem_unlock_code('   ') ->> 'status'), 'invalid_code', '空白だけのコードは invalid_code');
SELECT is((SELECT public.redeem_unlock_code(NULL) ->> 'status'), 'invalid_code', 'NULL は invalid_code');
SELECT is((SELECT public.redeem_unlock_code(repeat('x', 129)) ->> 'status'), 'invalid_code', '長すぎるコードは invalid_code');
SELECT is(
  (SELECT public.redeem_unlock_code('TQ-TEST-RETIRED') ->> 'status'),
  'invalid_code',
  '退役済みのコードは invalid_code'
);
SELECT is(
  (SELECT public.redeem_unlock_code('TQ-TEST-MISSING-ITEM') ->> 'item_key'),
  'synthetic_item_not_installed',
  '同梱に無いアイテムのコードもサーバーは付与を記録する (クライアントが欠落を扱う)'
);
SELECT results_eq(
  $$SELECT code FROM public.unlock_code_redemptions ORDER BY code$$,
  $$VALUES ('TQ-TEST-MISSING-ITEM'::text), ('TQ-TEST-TSHIRT'), ('TQ-TEST-WAND')$$,
  '自分の付与記録を読める (無効コードは記録されない)'
);

-- 直接の書き込みと非公開表
SELECT throws_ok(
  $$INSERT INTO public.unlock_code_redemptions (user_id, code, item_key) VALUES ('00000000-0000-4000-8000-000000000001', 'X', 'wand')$$,
  '42501', NULL, '付与記録への直接 INSERT は拒否'
);
SELECT throws_ok($$UPDATE public.unlock_code_redemptions SET item_key = 'x'$$, '42501', NULL, '付与記録の UPDATE は拒否');
SELECT throws_ok($$DELETE FROM public.unlock_code_redemptions$$, '42501', NULL, '付与記録の DELETE は拒否');
SELECT throws_ok($$SELECT * FROM catalog_private.unlock_codes$$, '42501', NULL, 'コード対応表は直接参照できない');
SELECT throws_ok(
  $$SELECT public.publish_unlock_codes('{"codes":[{"code":"A","item_key":"b"}]}'::jsonb)$$,
  '42501', NULL, 'authenticated: publish_unlock_codes は拒否'
);

-- ユーザー 2: 同じコードを使え、他人の記録は見えない
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SELECT is(
  (SELECT public.redeem_unlock_code('TQ-TEST-WAND') ->> 'status'),
  'redeemed',
  '別のユーザーは同じコードを使える (アカウントごとに 1 回)'
);
SELECT is(
  (SELECT count(*)::int FROM public.unlock_code_redemptions),
  1,
  '他人の付与記録は見えない'
);

-- 運用者による公開 (service_role)
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.publish_unlock_codes('{"codes":[]}'::jsonb)$$, '22023', NULL, '空のペイロードは拒否');
SELECT throws_ok(
  $$SELECT public.publish_unlock_codes('{"codes":[{"code":"A","item_key":"x"},{"code":"A","item_key":"y"}]}'::jsonb)$$,
  '22023', NULL, '重複したコードは拒否'
);
SELECT throws_ok(
  $$SELECT public.publish_unlock_codes('{"codes":[{"code":" A","item_key":"x"}]}'::jsonb)$$,
  '22023', NULL, '前後に空白があるコードは拒否'
);
SELECT throws_ok(
  $$SELECT public.publish_unlock_codes('{"codes":[{"code":"A"}]}'::jsonb)$$,
  '22023', NULL, 'item_key の無い項目は拒否'
);
SELECT throws_ok(
  format('SELECT public.publish_unlock_codes(%L::jsonb)', json_build_object('codes', json_build_array(json_build_object('code', E'\u00A0A', 'item_key', 'x')))::text),
  '22023', NULL, '前後に NBSP があるコードは拒否'
);
SELECT throws_ok(
  format('SELECT public.publish_unlock_codes(%L::jsonb)', json_build_object('codes', json_build_array(json_build_object('code', E'A\u3000', 'item_key', 'x')))::text),
  '22023', NULL, '前後に全角空白があるコードは拒否'
);
SELECT throws_ok(
  format('SELECT public.publish_unlock_codes(%L::jsonb)', json_build_object('codes', json_build_array(json_build_object('code', E'\uFEFFA', 'item_key', 'x')))::text),
  '22023', NULL, '前後に BOM があるコードは拒否'
);
SELECT is(
  (SELECT public.publish_unlock_codes('{"codes":[{"code":"TQ-TEST-WAND","item_key":"wand"},{"code":"TQ-TEST-NEW","item_key":"tshirt"}]}'::jsonb)),
  '{"inserted":1,"updated":0,"unchanged":1,"retired":2}'::jsonb,
  '公開: 新規 1、変更なし 1、入力に無い未退役の 2 件は退役'
);
SELECT is(
  (SELECT public.publish_unlock_codes('{"codes":[{"code":"TQ-TEST-WAND","item_key":"wand"},{"code":"TQ-TEST-NEW","item_key":"tshirt"}]}'::jsonb)),
  '{"inserted":0,"updated":0,"unchanged":2,"retired":0}'::jsonb,
  '再公開: 何も変わらない'
);

-- 公開結果の反映 (退役したコードは無効、ただし付与済みのユーザーには最初の結果を返す)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT is(
  (SELECT public.redeem_unlock_code('TQ-TEST-TSHIRT') ->> 'status'),
  'already_redeemed',
  '付与済みのコードが退役しても、本人には already_redeemed を返す'
);
SELECT is(
  (SELECT public.redeem_unlock_code('TQ-TEST-NEW') ->> 'status'),
  'redeemed',
  '新しく公開したコードは使える'
);
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
SELECT is(
  (SELECT public.redeem_unlock_code('TQ-TEST-TSHIRT') ->> 'status'),
  'invalid_code',
  '退役したコードは未使用のユーザーには無効'
);

SELECT * FROM finish();
ROLLBACK;
