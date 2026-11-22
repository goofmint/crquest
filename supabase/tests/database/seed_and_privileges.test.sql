-- シード、既定権限、RLS の所有者パターンを検証する。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(13);

SELECT is(current_user::text, 'postgres', 'テストは postgres で開始する');

-- シード
SELECT is(
  (SELECT count(*)::int FROM auth.users
   WHERE id IN ('00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000002',
                '00000000-0000-4000-8000-000000000003')
     AND email LIKE '%@example.test'),
  3,
  '合成ユーザー 3 件が投入されている'
);

-- 既定権限 (postgres が作る使い捨てオブジェクト)
CREATE TABLE public.tq_probe_privileges (id int PRIMARY KEY);
CREATE FUNCTION public.tq_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tq_probe_privileges'::regclass),
  false,
  'RLS は既定で無効 (各機能が明示的に有効化する)'
);
SELECT ok(NOT has_table_privilege('anon', 'public.tq_probe_privileges', 'SELECT'), 'anon: SELECT なし');
SELECT ok(NOT has_table_privilege('anon', 'public.tq_probe_privileges', 'INSERT'), 'anon: INSERT なし');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tq_probe_privileges', 'SELECT'), 'authenticated: SELECT なし');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tq_probe_privileges', 'UPDATE'), 'authenticated: UPDATE なし');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tq_probe_privileges', 'DELETE'), 'authenticated: DELETE なし');
SELECT ok(NOT has_function_privilege('anon', 'public.tq_probe_fn()', 'EXECUTE'), 'anon: EXECUTE なし');
SELECT ok(NOT has_function_privilege('authenticated', 'public.tq_probe_fn()', 'EXECUTE'), 'authenticated: EXECUTE なし');

-- RLS の所有者パターン
CREATE TABLE public.tq_probe_owned (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id),
  note text
);
ALTER TABLE public.tq_probe_owned ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.tq_probe_owned TO authenticated;
GRANT USAGE ON SEQUENCE public.tq_probe_owned_id_seq TO authenticated;
CREATE POLICY tq_probe_owned_select ON public.tq_probe_owned
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY tq_probe_owned_insert ON public.tq_probe_owned
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

INSERT INTO public.tq_probe_owned (user_id, note) VALUES
  ('00000000-0000-4000-8000-000000000001', 'one'),
  ('00000000-0000-4000-8000-000000000002', 'two');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

SELECT results_eq(
  'SELECT note FROM public.tq_probe_owned',
  $$VALUES ('one'::text)$$,
  'authenticated は自分の行だけ見える'
);
SELECT throws_ok(
  $$INSERT INTO public.tq_probe_owned (user_id, note) VALUES ('00000000-0000-4000-8000-000000000002', 'x')$$,
  '42501',
  NULL,
  '他人の user_id での INSERT は拒否される'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  'SELECT * FROM public.tq_probe_owned',
  '42501',
  NULL,
  'anon は権限エラー (42501)'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
