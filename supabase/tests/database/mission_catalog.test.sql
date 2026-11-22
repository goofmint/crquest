-- mission catalog (Issue #192): 一般ロールは読むだけ、書き込みは service_role の RPC のみ。
-- CLI はファイルをトランザクションで包まないため、BEGIN / ROLLBACK を明示する。
BEGIN;
SELECT plan(40);

-- 構造と権限
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.missions'::regclass), 'missions: RLS が有効');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mission_objectives'::regclass), 'mission_objectives: RLS が有効');
SELECT ok(
  NOT has_function_privilege('anon', 'public.publish_mission_catalog(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.publish_mission_catalog(jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.publish_mission_catalog(jsonb)', 'EXECUTE'),
  'publish_mission_catalog: service_role だけが EXECUTE できる'
);
SELECT ok(
  NOT has_schema_privilege('anon', 'catalog_private', 'USAGE')
  AND NOT has_schema_privilege('authenticated', 'catalog_private', 'USAGE'),
  'catalog_private: 一般ロールは USAGE なし'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.missions', 'DELETE')
  AND NOT has_table_privilege('service_role', 'public.mission_objectives', 'DELETE'),
  'service_role: DELETE は付与しない (論理退役)'
);

-- 検証用の入力
CREATE TEMP TABLE tq_cat AS SELECT $j${
  "missions": [
    {"id": "alpha", "extension": "ext", "title": "Alpha", "description": "A", "is_mission": true,
     "objectives": [
       {"id": "one", "title": "One", "description": "d1", "xp": 100},
       {"id": "two", "title": "Two", "description": "d2", "xp": 0}]},
    {"id": "beta", "extension": "ext", "title": "Beta", "description": "B", "is_mission": false,
     "objectives": []}
  ]
}$j$::jsonb AS c;
GRANT SELECT ON tq_cat TO service_role, anon, authenticated;

-- 一般ロールの拒否と閲覧
SET LOCAL ROLE anon;
SELECT throws_ok($$INSERT INTO public.missions (id, extension, title, description, sort_order) VALUES ('x','e','t','d',0)$$, '42501', NULL, 'anon: missions INSERT 拒否');
SELECT throws_ok($$UPDATE public.missions SET title = 'x'$$, '42501', NULL, 'anon: missions UPDATE 拒否');
SELECT throws_ok($$DELETE FROM public.missions$$, '42501', NULL, 'anon: missions DELETE 拒否');
SELECT throws_ok($$INSERT INTO public.mission_objectives (mission_id, id, title, description, xp, sort_order) VALUES ('x','y','t','d',1,0)$$, '42501', NULL, 'anon: mission_objectives INSERT 拒否');
SELECT throws_ok($$UPDATE public.mission_objectives SET xp = 1$$, '42501', NULL, 'anon: mission_objectives UPDATE 拒否');
SELECT throws_ok($$DELETE FROM public.mission_objectives$$, '42501', NULL, 'anon: mission_objectives DELETE 拒否');
SELECT throws_ok($$SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))$$, '42501', NULL, 'anon: RPC 拒否');
SELECT throws_ok($$SELECT * FROM catalog_private.objective_verification_definitions$$, '42501', NULL, 'anon: catalog_private 参照拒否');
SELECT lives_ok($$SELECT * FROM public.missions$$, 'anon: missions SELECT 可');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.missions (id, extension, title, description, sort_order) VALUES ('x','e','t','d',0)$$, '42501', NULL, 'authenticated: missions INSERT 拒否');
SELECT throws_ok($$UPDATE public.mission_objectives SET xp = 1$$, '42501', NULL, 'authenticated: mission_objectives UPDATE 拒否');
SELECT throws_ok($$DELETE FROM public.missions$$, '42501', NULL, 'authenticated: DELETE 拒否');
SELECT throws_ok($$SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))$$, '42501', NULL, 'authenticated: RPC 拒否');
SELECT throws_ok($$SELECT * FROM catalog_private.objective_verification_definitions$$, '42501', NULL, 'authenticated: catalog_private 参照拒否');
SELECT lives_ok($$SELECT * FROM public.mission_objectives$$, 'authenticated: mission_objectives SELECT 可');

-- 発行 (service_role)
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))),
  '{"missions":{"inserted":2,"updated":0,"unchanged":0,"retired":0},"objectives":{"inserted":2,"updated":0,"unchanged":0,"retired":0}}'::jsonb,
  '初回公開: すべて inserted'
);
CREATE TEMP TABLE tq_before AS SELECT 'm' AS k, id, updated_at FROM public.missions
  UNION ALL SELECT 'o', mission_id || '.' || id, updated_at FROM public.mission_objectives;
SELECT is(
  (SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))),
  '{"missions":{"inserted":0,"updated":0,"unchanged":2,"retired":0},"objectives":{"inserted":0,"updated":0,"unchanged":2,"retired":0}}'::jsonb,
  '再公開: inserted / updated は 0'
);
SELECT is(
  (SELECT count(*)::int FROM tq_before b
    JOIN (SELECT 'm' AS k, id, updated_at FROM public.missions
          UNION ALL SELECT 'o', mission_id || '.' || id, updated_at FROM public.mission_objectives) a
      USING (k, id, updated_at)),
  4,
  '再公開: updated_at は変わらない'
);
SELECT is(
  (SELECT string_agg(id || ':' || sort_order, ',' ORDER BY sort_order) FROM public.missions),
  'alpha:0,beta:1',
  'ミッションは入力順の sort_order'
);

-- XP の変更
SELECT is(
  (SELECT public.publish_mission_catalog(jsonb_set((SELECT c FROM tq_cat), '{missions,0,objectives,0,xp}', '150'))),
  '{"missions":{"inserted":0,"updated":0,"unchanged":2,"retired":0},"objectives":{"inserted":0,"updated":1,"unchanged":1,"retired":0}}'::jsonb,
  'XP 変更: updated が 1'
);
SELECT is((SELECT xp FROM public.mission_objectives WHERE mission_id = 'alpha' AND id = 'one'), 150, 'XP が反映される');

-- 退役と復帰
SELECT is(
  (SELECT public.publish_mission_catalog((SELECT c #- '{missions,0,objectives,1}' #- '{missions,1}' FROM tq_cat))),
  '{"missions":{"inserted":0,"updated":0,"unchanged":1,"retired":1},"objectives":{"inserted":0,"updated":1,"unchanged":0,"retired":1}}'::jsonb,
  '入力から外した目標とミッションは退役する'
);
SELECT ok(
  (SELECT retired_at IS NOT NULL FROM public.mission_objectives WHERE id = 'two')
  AND (SELECT retired_at IS NOT NULL FROM public.missions WHERE id = 'beta'),
  '退役行は retired_at を持ち、物理削除されない'
);
SELECT is(
  (SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))),
  '{"missions":{"inserted":0,"updated":1,"unchanged":1,"retired":0},"objectives":{"inserted":0,"updated":1,"unchanged":1,"retired":0}}'::jsonb,
  '再登場: retired_at が解除される'
);
SELECT ok(
  (SELECT count(*) = 0 FROM public.missions WHERE retired_at IS NOT NULL)
  AND (SELECT count(*) = 0 FROM public.mission_objectives WHERE retired_at IS NOT NULL),
  '復帰後に退役行がない'
);

-- 不正な入力: 例外になり、カタログは変わらない
SELECT throws_ok(
  $$SELECT public.publish_mission_catalog(jsonb_set((SELECT c FROM tq_cat), '{missions,0,objectives,0,xp}', '-1'))$$,
  '22023', NULL, '負の XP は 22023');
SELECT throws_ok(
  $$SELECT public.publish_mission_catalog(jsonb_set((SELECT c FROM tq_cat), '{missions,1,id}', '"alpha"'))$$,
  '22023', NULL, '重複したミッション ID は 22023');
SELECT throws_ok(
  $$SELECT public.publish_mission_catalog('{"missions": []}'::jsonb)$$,
  '22023', NULL, '空のカタログは 22023 (全退役を防ぐ)');
SELECT is(
  (SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))),
  '{"missions":{"inserted":0,"updated":0,"unchanged":2,"retired":0},"objectives":{"inserted":0,"updated":0,"unchanged":2,"retired":0}}'::jsonb,
  '不正な入力の後もカタログは変わらない'
);

-- 形が不正な入力 (NULL を返す型検査のすり抜け防止)
SELECT throws_ok($$SELECT public.publish_mission_catalog('{}'::jsonb)$$, '22023', NULL, '{} は 22023');
SELECT throws_ok($$SELECT public.publish_mission_catalog(NULL)$$, '22023', NULL, 'NULL は 22023');
SELECT throws_ok(
  $$SELECT public.publish_mission_catalog((SELECT c #- '{missions,0,objectives}' FROM tq_cat))$$,
  '22023', NULL, 'objectives の無いミッションは 22023');
SELECT is(
  (SELECT public.publish_mission_catalog((SELECT c FROM tq_cat))),
  '{"missions":{"inserted":0,"updated":0,"unchanged":2,"retired":0},"objectives":{"inserted":0,"updated":0,"unchanged":2,"retired":0}}'::jsonb,
  '形が不正な入力の後もカタログは変わらず、objectives: [] は有効');

-- 100.0 のような小数表記の整数も受け付ける
SELECT is(
  (SELECT public.publish_mission_catalog(jsonb_set((SELECT c FROM tq_cat), '{missions,0,objectives,0,xp}', '100.0'))),
  '{"missions":{"inserted":0,"updated":0,"unchanged":2,"retired":0},"objectives":{"inserted":0,"updated":0,"unchanged":2,"retired":0}}'::jsonb,
  'xp: 100.0 は 100 として扱われる');
SELECT throws_ok(
  $$SELECT public.publish_mission_catalog(jsonb_set((SELECT c FROM tq_cat), '{missions,0,objectives,0,xp}', '100.5'))$$,
  '22023', NULL, 'xp: 小数は 22023');

SELECT finish();
ROLLBACK;
