-- アイテム解除コードと植樹進捗の Supabase 化 (Issue #191)
--
--   * 解除コード     : コード→アイテムの対応表は API 非公開 (catalog_private.unlock_codes)。
--                      照合と付与の記録は redeem_unlock_code (SECURITY DEFINER) だけが行う。
--                      付与記録は (user_id, code) で一意。再送しても二重に記録せず、最初の item_key を返す。
--   * 植樹進捗       : 対象の許可リストは API 非公開 (catalog_private.tree_planting_targets)。
--                      record_tree_planting が許可リストを検証して (user_id, mission_id, target_id) を 1 回だけ記録する。
--
-- 植樹の記録はクライアントの申告 (attestation) であり、サーバーが認定した達成
-- (public.certified_achievements) ではない。ランキングやチーム貢献の集計には使わない。
-- RPC ごとの試行回数制限は実装しない (groups の join_group と同じく Supabase 側の制限に依存する)。
-- 規則の全体は docs/supabase/unlocks-and-trees.md。
-- catalog_private スキーマは mission_catalog マイグレーションで作成済み (API 非公開)。

-- ===== 解除コード =====

CREATE TABLE catalog_private.unlock_codes (
  -- 前後の空白 (ASCII と Unicode の空白。JS の trim() と Rust の trim() が除去するものの和集合) を除去した値。
  -- 大文字と小文字は区別する (レガシーのコードを統合しないため)。
  code text PRIMARY KEY,
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CONSTRAINT unlock_codes_code_normalized CHECK (
    code !~ '^[\t\n\v\f\r \u0085   -     　﻿]|[\t\n\v\f\r \u0085   -     　﻿]$' AND char_length(code) BETWEEN 1 AND 128
  ),
  CONSTRAINT unlock_codes_item_key_valid CHECK (char_length(item_key) BETWEEN 1 AND 128)
);

COMMENT ON TABLE catalog_private.unlock_codes IS
  'Unlock code -> item key. Server-only (not exposed via the API). Populated by publish_unlock_codes (service_role) from an operator-supplied mapping; never committed to the repository. Retired rows are kept (retired_at).';

ALTER TABLE catalog_private.unlock_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_private.unlock_codes FROM PUBLIC, anon, authenticated;

CREATE TABLE public.unlock_code_redemptions (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code text NOT NULL,
  -- 付与時点の item_key。コードが後で退役・変更されても、再送では最初の結果を返す。
  item_key text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, code)
);

COMMENT ON TABLE public.unlock_code_redemptions IS
  'Per-account record of redeemed unlock codes (each code is usable once per account). Written only by redeem_unlock_code; the owner can read their own rows.';

ALTER TABLE public.unlock_code_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unlock_code_redemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.unlock_code_redemptions TO authenticated;
CREATE POLICY unlock_code_redemptions_select_own ON public.unlock_code_redemptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 戻り値: {status: 'redeemed' | 'already_redeemed' | 'invalid_code', item_key, redeemed_at}
-- 無効コードでは item_key / redeemed_at は null。コードの存在有無 (退役を含む) は無効コードと区別して返さない。
CREATE FUNCTION public.redeem_unlock_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  -- 前後の空白は JS / Rust の trim() と同じ集合を除去する (publish_unlock_codes の拒否規則と同じ)
  v_code text := pg_catalog.regexp_replace(coalesce(p_code, ''), '^[\t\n\v\f\r \u0085   -     　﻿]+|[\t\n\v\f\r \u0085   -     　﻿]+$', '', 'g');
  v_item_key text;
  v_redeemed_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_code = '' OR char_length(v_code) > 128 THEN
    RETURN jsonb_build_object('status', 'invalid_code', 'item_key', NULL, 'redeemed_at', NULL);
  END IF;

  -- 付与済みなら、コードが退役していても最初の結果を返す (クライアントがローカル付与を修復できる)
  SELECT r.item_key, r.redeemed_at INTO v_item_key, v_redeemed_at
  FROM public.unlock_code_redemptions r
  WHERE r.user_id = v_uid AND r.code = v_code;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_redeemed', 'item_key', v_item_key, 'redeemed_at', v_redeemed_at);
  END IF;

  SELECT c.item_key INTO v_item_key
  FROM catalog_private.unlock_codes c
  WHERE c.code = v_code AND c.retired_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_code', 'item_key', NULL, 'redeemed_at', NULL);
  END IF;

  -- 同時の再送は一意制約で 1 回にまとまる。負けた側は DO NOTHING で行を返さない。
  INSERT INTO public.unlock_code_redemptions (user_id, code, item_key)
  VALUES (v_uid, v_code, v_item_key)
  ON CONFLICT (user_id, code) DO NOTHING
  RETURNING redeemed_at INTO v_redeemed_at;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'redeemed', 'item_key', v_item_key, 'redeemed_at', v_redeemed_at);
  END IF;

  SELECT r.item_key, r.redeemed_at INTO v_item_key, v_redeemed_at
  FROM public.unlock_code_redemptions r
  WHERE r.user_id = v_uid AND r.code = v_code;
  RETURN jsonb_build_object('status', 'already_redeemed', 'item_key', v_item_key, 'redeemed_at', v_redeemed_at);
END;
$$;

COMMENT ON FUNCTION public.redeem_unlock_code(text) IS
  'Redeems an unlock code for auth.uid(). Idempotent per (user, code): a resend returns already_redeemed with the first item_key. Trims surrounding whitespace; case sensitive.';

-- 運用者用: コード対応表の一括公開。入力: {"codes":[{"code": "...", "item_key": "..."}]}
-- 1 回の呼び出し = 1 トランザクション。入力に無い行は削除せず retired_at を設定する。
-- 退役したコードを再度入力に含めると復活する。同じコードを別アイテムへ変更した場合、既存の付与記録は変わらない。
CREATE FUNCTION public.publish_unlock_codes(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e jsonb;
  seen text[] := '{}';
  v_code text;
  v_item text;
  v_ins integer; v_upd integer; v_ret integer; v_total integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('terminalquest.publish_unlock_codes', 0)
  );

  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(payload -> 'codes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'payload.codes must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(payload -> 'codes') = 0 THEN
    RAISE EXCEPTION 'payload.codes must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(payload -> 'codes') LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object'
       OR jsonb_typeof(e -> 'code') IS DISTINCT FROM 'string'
       OR jsonb_typeof(e -> 'item_key') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid code entry (code and item_key must be strings)' USING ERRCODE = '22023';
    END IF;
    v_code := e ->> 'code';
    v_item := e ->> 'item_key';
    IF v_code ~ '^[\t\n\v\f\r \u0085   -     　﻿]|[\t\n\v\f\r \u0085   -     　﻿]$' OR char_length(v_code) NOT BETWEEN 1 AND 128 THEN
      RAISE EXCEPTION 'invalid code entry (code must be 1-128 chars without surrounding whitespace)'
        USING ERRCODE = '22023';
    END IF;
    IF char_length(v_item) NOT BETWEEN 1 AND 128 THEN
      RAISE EXCEPTION 'invalid code entry (item_key must be 1-128 chars)' USING ERRCODE = '22023';
    END IF;
    IF v_code = ANY (seen) THEN
      RAISE EXCEPTION 'duplicate code in payload' USING ERRCODE = '22023';
    END IF;
    seen := seen || v_code;
  END LOOP;

  v_total := jsonb_array_length(payload -> 'codes');

  WITH up AS (
    INSERT INTO catalog_private.unlock_codes AS t (code, item_key)
    SELECT x ->> 'code', x ->> 'item_key'
    FROM jsonb_array_elements(payload -> 'codes') AS x
    ON CONFLICT (code) DO UPDATE
      SET item_key = EXCLUDED.item_key, retired_at = NULL
      WHERE (t.item_key, t.retired_at) IS DISTINCT FROM (EXCLUDED.item_key, NULL::timestamptz)
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
    INTO v_ins, v_upd FROM up;

  WITH r AS (
    UPDATE catalog_private.unlock_codes t
       SET retired_at = clock_timestamp()
     WHERE t.retired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(payload -> 'codes') AS x WHERE x ->> 'code' = t.code)
    RETURNING 1
  ) SELECT count(*) INTO v_ret FROM r;

  RETURN jsonb_build_object(
    'inserted', v_ins, 'updated', v_upd, 'unchanged', v_total - v_ins - v_upd, 'retired', v_ret);
END;
$$;

COMMENT ON FUNCTION public.publish_unlock_codes(jsonb) IS
  'Bulk publish of the unlock code mapping in one transaction. service_role only. Rows missing from the input get retired_at set (never deleted).';

-- ===== 植樹進捗 =====

CREATE TABLE catalog_private.tree_planting_targets (
  mission_id text NOT NULL,
  target_id text NOT NULL,
  target_kind text NOT NULL,
  -- 旧 Firebase API (POST /quest/tracking/trees) が送っていた識別子。追跡用で、クライアントは送らない。
  legacy_mission_name text NOT NULL,
  legacy_objective_name text NOT NULL,
  retired_at timestamptz,
  PRIMARY KEY (mission_id, target_id),
  CONSTRAINT tree_planting_targets_kind CHECK (target_kind IN ('objective', 'map_object'))
);

COMMENT ON TABLE catalog_private.tree_planting_targets IS
  'Allow-list of tree planting targets (mission, objective or map object). Not in the mission catalog: fog_owl is not published there and the catalog has no tree flag. Server-only.';

ALTER TABLE catalog_private.tree_planting_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_private.tree_planting_targets FROM PUBLIC, anon, authenticated;

INSERT INTO catalog_private.tree_planting_targets
  (mission_id, target_id, target_kind, legacy_mission_name, legacy_objective_name)
VALUES
  ('fog_owl', 'owl_plant_tree1', 'objective', 'owl', 'owl_plant_tree1'),
  ('dev_skills', 'skills_plant_tree1', 'objective', 'ctf', 'ctf_plant_tree1'),
  ('dev_skills', 'devskills_tree1', 'map_object', 'earthday2021', 'devskills_tree1');

CREATE TABLE public.tree_plantings (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  mission_id text NOT NULL,
  target_id text NOT NULL,
  planted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, mission_id, target_id)
);

COMMENT ON TABLE public.tree_plantings IS
  'Self-reported tree planting records (attestation), one per (user, mission, target). NOT a certified achievement: never used for rankings or team contribution. Written only by record_tree_planting.';

ALTER TABLE public.tree_plantings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tree_plantings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tree_plantings TO authenticated;
CREATE POLICY tree_plantings_select_own ON public.tree_plantings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 戻り値: {status: 'recorded' | 'already_recorded' | 'unsupported_target', planted_at}
CREATE FUNCTION public.record_tree_planting(p_mission_id text, p_target_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_planted_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_mission_id IS NULL OR p_target_id IS NULL
     OR char_length(p_mission_id) > 128 OR char_length(p_target_id) > 128
     OR NOT EXISTS (
       SELECT 1 FROM catalog_private.tree_planting_targets t
       WHERE t.mission_id = p_mission_id AND t.target_id = p_target_id AND t.retired_at IS NULL
     ) THEN
    RETURN jsonb_build_object('status', 'unsupported_target', 'planted_at', NULL);
  END IF;

  INSERT INTO public.tree_plantings (user_id, mission_id, target_id)
  VALUES (v_uid, p_mission_id, p_target_id)
  ON CONFLICT (user_id, mission_id, target_id) DO NOTHING
  RETURNING planted_at INTO v_planted_at;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'recorded', 'planted_at', v_planted_at);
  END IF;

  SELECT p.planted_at INTO v_planted_at
  FROM public.tree_plantings p
  WHERE p.user_id = v_uid AND p.mission_id = p_mission_id AND p.target_id = p_target_id;
  RETURN jsonb_build_object('status', 'already_recorded', 'planted_at', v_planted_at);
END;
$$;

COMMENT ON FUNCTION public.record_tree_planting(text, text) IS
  'Records a tree planting for auth.uid() if the target is on the allow-list. Idempotent per (user, mission, target). Self-reported (attestation).';

-- ===== 実行権限 =====

REVOKE ALL ON FUNCTION public.redeem_unlock_code(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_tree_planting(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_unlock_codes(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_unlock_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_tree_planting(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_unlock_codes(jsonb) TO service_role;
