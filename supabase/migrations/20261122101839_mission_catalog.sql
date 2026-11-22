-- ミッションカタログ (Issue #192)
--
-- 同梱コンテンツ (ミッション・目標・報酬 XP) を Supabase に公開する。
--   * 公開フィールド     : public.missions / public.mission_objectives (誰でも読める。書き込みは service_role のみ)
--   * 認定用の検証定義   : catalog_private.objective_verification_definitions (API 非公開。Issue #189 が使う)
--   * 書き込み経路       : public.publish_mission_catalog(jsonb) (service_role だけが EXECUTE できる)
-- クライアント用の validator.js / validation_fields / 報酬アイテム / 翻訳は保存しない。

-- ===== 公開カタログ =====

CREATE TABLE public.missions (
  id text PRIMARY KEY,
  extension text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  is_mission boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CONSTRAINT missions_id_not_empty CHECK (id <> ''),
  CONSTRAINT missions_id_no_dot CHECK (position('.' IN id) = 0)
);

COMMENT ON TABLE public.missions IS
  'Public mission catalog derived from bundled content (level directory name = id). Not user data. Written only by publish_mission_catalog (service_role). retired_at is set when a level disappears from the bundle.';

CREATE TABLE public.mission_objectives (
  mission_id text NOT NULL REFERENCES public.missions (id) ON DELETE RESTRICT,
  id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  xp integer NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (mission_id, id),
  CONSTRAINT mission_objectives_id_not_empty CHECK (id <> ''),
  CONSTRAINT mission_objectives_xp_non_negative CHECK (xp >= 0)
);

COMMENT ON TABLE public.mission_objectives IS
  'Public objective catalog derived from bundled content. (mission_id, id) maps 1:1 to the game completion key "<levelName>.<objectiveName>". Not user data. Written only by publish_mission_catalog (service_role).';

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_objectives ENABLE ROW LEVEL SECURITY;

-- 権限は既定に依存せず明示する。一般ロールは SELECT のみ。DELETE は誰にも付与しない (論理退役)。
REVOKE ALL ON public.missions, public.mission_objectives FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.missions, public.mission_objectives TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.missions, public.mission_objectives TO service_role;

CREATE POLICY missions_select_all ON public.missions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY mission_objectives_select_all ON public.mission_objectives
  FOR SELECT TO anon, authenticated USING (true);

-- ===== 認定用検証定義の非公開保管先 =====
-- このスキーマは supabase/config.toml の [api].schemas に含めない (意図的に API 非公開)。
-- sync (publish_mission_catalog) はここへ書き込まない。定義の投入とアクセス関数は Issue #189 の担当。
-- service_role (サーバー側の認定処理) には読み取りだけを許可する。

CREATE SCHEMA catalog_private;
REVOKE ALL ON SCHEMA catalog_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA catalog_private TO service_role;

COMMENT ON SCHEMA catalog_private IS
  'Server-only catalog data (not exposed via the API). Verification definitions for certification (Issue #189) live here. Populated by #189, never by the mission sync.';

CREATE TABLE catalog_private.objective_verification_definitions (
  mission_id text NOT NULL,
  objective_id text NOT NULL,
  definition_version integer NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, objective_id),
  FOREIGN KEY (mission_id, objective_id)
    REFERENCES public.mission_objectives (mission_id, id) ON DELETE RESTRICT,
  CONSTRAINT objective_verification_definitions_version_positive CHECK (definition_version >= 1),
  CONSTRAINT objective_verification_definitions_is_object CHECK (jsonb_typeof(definition) = 'object')
);

COMMENT ON TABLE catalog_private.objective_verification_definitions IS
  'Machine-readable, server-side verification definition per objective (inputs/expected results) used to certify achievements (#189). NOT validator.js or validation_fields, which are client-side code/UI definitions.';

ALTER TABLE catalog_private.objective_verification_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_private.objective_verification_definitions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON catalog_private.objective_verification_definitions TO service_role;

-- ===== 発行 RPC =====
-- 入力: {"missions":[{id, extension, title, description, is_mission, objectives:[{id, title, description, xp}]}]}
-- 配列の順序が sort_order になる。1 回の呼び出し = 1 トランザクション。
-- 内容が同じ行は UPDATE しない (updated_at を動かさない)。入力に無い行は retired_at を設定する。

CREATE FUNCTION public.publish_mission_catalog(catalog jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  m jsonb;
  o jsonb;
  seen_missions text[] := '{}';
  seen_objectives text[];
  m_ins integer; m_upd integer; m_ret integer; m_total integer;
  o_ins integer; o_upd integer; o_ret integer; o_total integer;
BEGIN
  -- 同時発行を直列化する (トランザクション終了で解放)
  PERFORM pg_advisory_xact_lock(hashtextextended('terminalquest.publish_mission_catalog', 0));

  IF jsonb_typeof(catalog) IS DISTINCT FROM 'object'
     OR jsonb_typeof(catalog -> 'missions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'catalog.missions must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(catalog -> 'missions') = 0 THEN
    RAISE EXCEPTION 'catalog.missions must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(catalog -> 'missions') LOOP
    IF jsonb_typeof(m) IS DISTINCT FROM 'object'
       OR jsonb_typeof(m -> 'id') IS DISTINCT FROM 'string' OR (m ->> 'id') = '' OR position('.' IN (m ->> 'id')) > 0
       OR jsonb_typeof(m -> 'extension') IS DISTINCT FROM 'string' OR (m ->> 'extension') = ''
       OR jsonb_typeof(m -> 'title') IS DISTINCT FROM 'string' OR (m ->> 'title') = ''
       OR jsonb_typeof(m -> 'description') IS DISTINCT FROM 'string'
       OR jsonb_typeof(m -> 'is_mission') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(m -> 'objectives') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid mission entry: %', left(m::text, 80) USING ERRCODE = '22023';
    END IF;
    IF (m ->> 'id') = ANY (seen_missions) THEN
      RAISE EXCEPTION 'duplicate mission id: %', m ->> 'id' USING ERRCODE = '22023';
    END IF;
    seen_missions := seen_missions || (m ->> 'id');

    seen_objectives := '{}';
    FOR o IN SELECT * FROM jsonb_array_elements(m -> 'objectives') LOOP
      IF jsonb_typeof(o) IS DISTINCT FROM 'object'
         OR jsonb_typeof(o -> 'id') IS DISTINCT FROM 'string' OR (o ->> 'id') = ''
         OR jsonb_typeof(o -> 'title') IS DISTINCT FROM 'string' OR (o ->> 'title') = ''
         OR jsonb_typeof(o -> 'description') IS DISTINCT FROM 'string'
         OR jsonb_typeof(o -> 'xp') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'invalid objective entry in mission %: %', m ->> 'id', left(o::text, 80)
          USING ERRCODE = '22023';
      END IF;
      IF (o ->> 'xp')::numeric <> trunc((o ->> 'xp')::numeric)
         OR (o ->> 'xp')::numeric < 0
         OR (o ->> 'xp')::numeric > 2147483647 THEN
        RAISE EXCEPTION 'invalid xp in mission %: %', m ->> 'id', left(o::text, 80)
          USING ERRCODE = '22023';
      END IF;
      IF (o ->> 'id') = ANY (seen_objectives) THEN
        RAISE EXCEPTION 'duplicate objective id in mission %: %', m ->> 'id', o ->> 'id'
          USING ERRCODE = '22023';
      END IF;
      seen_objectives := seen_objectives || (o ->> 'id');
    END LOOP;
  END LOOP;

  -- ミッション: 内容が変わった行だけ更新し、退役済みで再登場した行は復帰させる
  WITH input AS (
    SELECT (e.value ->> 'id') AS id,
           (e.value ->> 'extension') AS extension,
           (e.value ->> 'title') AS title,
           (e.value ->> 'description') AS description,
           (e.value ->> 'is_mission')::boolean AS is_mission,
           (e.ordinality - 1)::integer AS sort_order
    FROM jsonb_array_elements(catalog -> 'missions') WITH ORDINALITY AS e (value, ordinality)
  ), up AS (
    INSERT INTO public.missions AS t (id, extension, title, description, is_mission, sort_order)
    SELECT id, extension, title, description, is_mission, sort_order FROM input
    ON CONFLICT (id) DO UPDATE
      SET extension = EXCLUDED.extension,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          is_mission = EXCLUDED.is_mission,
          sort_order = EXCLUDED.sort_order,
          retired_at = NULL,
          updated_at = clock_timestamp()
      WHERE (t.extension, t.title, t.description, t.is_mission, t.sort_order, t.retired_at)
        IS DISTINCT FROM
        (EXCLUDED.extension, EXCLUDED.title, EXCLUDED.description, EXCLUDED.is_mission, EXCLUDED.sort_order, NULL::timestamptz)
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
    INTO m_ins, m_upd FROM up;
  m_total := jsonb_array_length(catalog -> 'missions');

  -- 目標
  WITH input AS (
    SELECT (m.value ->> 'id') AS mission_id,
           (o.value ->> 'id') AS id,
           (o.value ->> 'title') AS title,
           (o.value ->> 'description') AS description,
           (o.value ->> 'xp')::integer AS xp,
           (o.ordinality - 1)::integer AS sort_order
    FROM jsonb_array_elements(catalog -> 'missions') AS m (value),
         LATERAL jsonb_array_elements(m.value -> 'objectives') WITH ORDINALITY AS o (value, ordinality)
  ), up AS (
    INSERT INTO public.mission_objectives AS t (mission_id, id, title, description, xp, sort_order)
    SELECT mission_id, id, title, description, xp, sort_order FROM input
    ON CONFLICT (mission_id, id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          xp = EXCLUDED.xp,
          sort_order = EXCLUDED.sort_order,
          retired_at = NULL,
          updated_at = clock_timestamp()
      WHERE (t.title, t.description, t.xp, t.sort_order, t.retired_at)
        IS DISTINCT FROM
        (EXCLUDED.title, EXCLUDED.description, EXCLUDED.xp, EXCLUDED.sort_order, NULL::timestamptz)
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
    INTO o_ins, o_upd FROM up;
  SELECT coalesce(sum(jsonb_array_length(x -> 'objectives')), 0)::integer
    INTO o_total FROM jsonb_array_elements(catalog -> 'missions') AS x;

  -- 論理退役: 入力に無く、まだ退役していない行
  WITH r AS (
    UPDATE public.mission_objectives t
       SET retired_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE t.retired_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(catalog -> 'missions') AS m (value),
              jsonb_array_elements(m.value -> 'objectives') AS o (value)
         WHERE m.value ->> 'id' = t.mission_id AND o.value ->> 'id' = t.id)
    RETURNING 1
  ) SELECT count(*) INTO o_ret FROM r;

  WITH r AS (
    UPDATE public.missions t
       SET retired_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE t.retired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(catalog -> 'missions') AS m (value)
         WHERE m.value ->> 'id' = t.id)
    RETURNING 1
  ) SELECT count(*) INTO m_ret FROM r;

  RETURN jsonb_build_object(
    'missions', jsonb_build_object(
      'inserted', m_ins, 'updated', m_upd, 'unchanged', m_total - m_ins - m_upd, 'retired', m_ret),
    'objectives', jsonb_build_object(
      'inserted', o_ins, 'updated', o_upd, 'unchanged', o_total - o_ins - o_upd, 'retired', o_ret)
  );
END;
$$;

COMMENT ON FUNCTION public.publish_mission_catalog(jsonb) IS
  'Bulk upsert of the mission catalog in one transaction. service_role only. Rows with identical content are not touched; rows missing from the input get retired_at set.';

REVOKE ALL ON FUNCTION public.publish_mission_catalog(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_mission_catalog(jsonb) TO service_role;
