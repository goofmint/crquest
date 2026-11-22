-- 正しい提出結果を検証して達成を認定する (Issue #189)
--
-- 構成:
--   * 検証定義 (方式・入力・期待結果) : catalog_private.objective_verification_definitions.definition (#192 で作成済み。API 非公開)
--                                       service_role 専用の public.publish_verification_definitions(jsonb) で投入する
--   * 加点値                          : public.mission_objectives.xp (サーバー側のミッション定義)。クライアント値は使わない
--   * チャレンジ                      : catalog_private.certification_challenges (期待結果を含むため API 非公開)
--   * 認定記録                        : public.certified_achievements (#188 の台帳。ON CONFLICT で二重加点を防ぐ)
--   * クライアント向け API            : public.issue_certification_challenge / public.submit_certification_challenge
-- 提出コードの実行や隔離環境は無い。サーバーは提出された「結果」を、保存済みの期待結果と比較するだけ。
-- 規則の全体は docs/supabase/certification.md。
--
-- definition の形式 (version 1):
--   text_answer   : {"method":"text_answer","normalization":"trim"|"trim_lower","expected":{"<field>":"<answer>",...},"ttl_seconds":600}
--   result_vector : {"method":"result_vector","case_count":N,"cases":[{"input":<json>,"expected":<json>},...],"ttl_seconds":600}

-- ===== チャレンジ =====

CREATE TABLE catalog_private.certification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  mission_id text NOT NULL,
  objective_id text NOT NULL,
  definition_version integer NOT NULL,
  method text NOT NULL,
  normalization text,
  -- 発行時の入力と期待結果の複製。定義を後で変えても、発行済みチャレンジの判定は変わらない。
  inputs jsonb NOT NULL,
  expected jsonb NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  outcome text,
  points_awarded integer,
  FOREIGN KEY (mission_id, objective_id)
    REFERENCES public.mission_objectives (mission_id, id) ON DELETE RESTRICT,
  CONSTRAINT certification_challenges_method_valid CHECK (method IN ('text_answer', 'result_vector')),
  CONSTRAINT certification_challenges_expiry_after_issue CHECK (expires_at > issued_at),
  CONSTRAINT certification_challenges_outcome_valid
    CHECK (outcome IS NULL OR outcome IN ('certified', 'already_certified', 'incorrect')),
  -- 消費の記録 (時刻・結果・加点値) は 3 つ同時に設定される
  CONSTRAINT certification_challenges_consumed_together CHECK (
    (consumed_at IS NULL AND outcome IS NULL AND points_awarded IS NULL)
    OR (consumed_at IS NOT NULL AND outcome IS NOT NULL AND points_awarded IS NOT NULL AND points_awarded >= 0)
  )
);

CREATE INDEX certification_challenges_user_objective_idx
  ON catalog_private.certification_challenges (user_id, mission_id, objective_id);

COMMENT ON TABLE catalog_private.certification_challenges IS
  'Issued certification challenges (per user and objective, with expiry). Holds expected results, so it is API-private (no client access). Written only by the SECURITY DEFINER certification RPCs. Expired rows are not purged automatically.';

ALTER TABLE catalog_private.certification_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_private.certification_challenges FROM PUBLIC, anon, authenticated;

-- ===== 検証定義の検証と投入 =====

CREATE FUNCTION catalog_private.validate_verification_definition(d jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_method text;
  c jsonb;
  k text;
  v jsonb;
BEGIN
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'definition must be an object' USING ERRCODE = '22023';
  END IF;
  v_method := d ->> 'method';
  IF d ? 'ttl_seconds' AND (
       jsonb_typeof(d -> 'ttl_seconds') IS DISTINCT FROM 'number'
       OR (d ->> 'ttl_seconds')::numeric <> trunc((d ->> 'ttl_seconds')::numeric)
       OR (d ->> 'ttl_seconds')::numeric NOT BETWEEN 1 AND 86400) THEN
    RAISE EXCEPTION 'ttl_seconds must be an integer between 1 and 86400' USING ERRCODE = '22023';
  END IF;

  IF v_method = 'text_answer' THEN
    IF (d ->> 'normalization') IS NULL OR (d ->> 'normalization') NOT IN ('trim', 'trim_lower') THEN
      RAISE EXCEPTION 'text_answer requires normalization trim|trim_lower' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(d -> 'expected') IS DISTINCT FROM 'object' OR d -> 'expected' = '{}'::jsonb THEN
      RAISE EXCEPTION 'text_answer requires a non-empty expected object' USING ERRCODE = '22023';
    END IF;
    FOR k, v IN SELECT * FROM jsonb_each(d -> 'expected') LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'expected.% must be a string', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSIF v_method = 'result_vector' THEN
    IF jsonb_typeof(d -> 'cases') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'cases') = 0 THEN
      RAISE EXCEPTION 'result_vector requires a non-empty cases array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(d -> 'case_count') IS DISTINCT FROM 'number'
       OR (d ->> 'case_count')::numeric <> trunc((d ->> 'case_count')::numeric)
       OR (d ->> 'case_count')::numeric < 1
       OR (d ->> 'case_count')::numeric > jsonb_array_length(d -> 'cases') THEN
      RAISE EXCEPTION 'case_count must be an integer between 1 and the number of cases' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT * FROM jsonb_array_elements(d -> 'cases') LOOP
      IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT (c ? 'input') OR NOT (c ? 'expected') THEN
        RAISE EXCEPTION 'each case needs input and expected' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'unknown method: %', coalesce(v_method, '(none)') USING ERRCODE = '22023';
  END IF;
END;
$$;

-- 検証定義の一括投入 (service_role のみ)。入力: {"definitions":[{mission_id, objective_id, version, definition}]}
-- 入力が定義の完全な集合になる: 入力に無い定義は削除する (定義は台帳から参照されない)。1 回の呼び出し = 1 トランザクション。
-- 対象の目標は public.mission_objectives に存在し、退役していないこと (先にカタログを発行する)。
CREATE FUNCTION public.publish_verification_definitions(p_definitions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e jsonb;
  seen text[] := '{}';
  v_key text;
  v_ins integer;
  v_upd integer;
  v_del integer;
  v_total integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('terminalquest.publish_verification_definitions', 0));

  IF jsonb_typeof(p_definitions) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_definitions -> 'definitions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'definitions must be an array' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(p_definitions -> 'definitions') LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object'
       OR jsonb_typeof(e -> 'mission_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(e -> 'objective_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(e -> 'version') IS DISTINCT FROM 'number'
       OR (e ->> 'version')::numeric <> trunc((e ->> 'version')::numeric)
       OR (e ->> 'version')::numeric < 1 OR (e ->> 'version')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'invalid definition entry: %', left(e::text, 80) USING ERRCODE = '22023';
    END IF;
    v_key := (e ->> 'mission_id') || '.' || (e ->> 'objective_id');
    IF v_key = ANY (seen) THEN
      RAISE EXCEPTION 'duplicate definition: %', v_key USING ERRCODE = '22023';
    END IF;
    seen := seen || v_key;
    IF NOT EXISTS (
      SELECT 1 FROM public.mission_objectives o
      JOIN public.missions m ON m.id = o.mission_id
      WHERE o.mission_id = e ->> 'mission_id' AND o.id = e ->> 'objective_id'
        AND o.retired_at IS NULL AND m.retired_at IS NULL
    ) THEN
      RAISE EXCEPTION 'unknown or retired objective: %', v_key USING ERRCODE = '22023';
    END IF;
    PERFORM catalog_private.validate_verification_definition(e -> 'definition');
  END LOOP;

  WITH input AS (
    SELECT x ->> 'mission_id' AS mission_id, x ->> 'objective_id' AS objective_id,
           (x ->> 'version')::numeric::integer AS version, x -> 'definition' AS definition
    FROM jsonb_array_elements(p_definitions -> 'definitions') AS t (x)
  ), up AS (
    INSERT INTO catalog_private.objective_verification_definitions AS t
      (mission_id, objective_id, definition_version, definition)
    SELECT mission_id, objective_id, version, definition FROM input
    ON CONFLICT (mission_id, objective_id) DO UPDATE
      SET definition_version = EXCLUDED.definition_version,
          definition = EXCLUDED.definition,
          updated_at = clock_timestamp()
      WHERE (t.definition_version, t.definition) IS DISTINCT FROM (EXCLUDED.definition_version, EXCLUDED.definition)
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted) INTO v_ins, v_upd FROM up;
  v_total := jsonb_array_length(p_definitions -> 'definitions');

  WITH d AS (
    DELETE FROM catalog_private.objective_verification_definitions t
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_definitions -> 'definitions') AS x
      WHERE x ->> 'mission_id' = t.mission_id AND x ->> 'objective_id' = t.objective_id)
    RETURNING 1
  ) SELECT count(*) INTO v_del FROM d;

  RETURN jsonb_build_object('inserted', v_ins, 'updated', v_upd,
                            'unchanged', v_total - v_ins - v_upd, 'deleted', v_del);
END;
$$;

COMMENT ON FUNCTION public.publish_verification_definitions(jsonb) IS
  'Bulk replace of objective verification definitions (catalog_private) in one transaction. service_role only. Objectives must already exist in the published catalog and not be retired.';

REVOKE ALL ON FUNCTION public.publish_verification_definitions(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_verification_definitions(jsonb) TO service_role;

-- ===== 照合 (内部関数。API ロールには公開しない) =====
-- text_answer  : 提出値は期待値と同じキー集合の文字列オブジェクト。前後の空白を除去 (trim_lower は小文字化も) し完全一致。
--                内部の空白は正規化しない。
-- result_vector: 提出値は入力と同じ長さの配列。要素ごとに jsonb の等値で比較する (6 と "6" は不一致)。
-- 形式の誤りは 22023 (チャレンジは消費されない)。正誤は boolean で返す。

CREATE FUNCTION catalog_private.js_trim(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- JS の String.prototype.trim が除去する主な空白 (E'' 文字列の \v は垂直タブではないため chr(11) を使う; ASCII 空白、NBSP、BOM、行・段落区切り)
  SELECT pg_catalog.btrim(p_text,
    E' \t\r\n\f' || pg_catalog.chr(11) || pg_catalog.chr(160) || pg_catalog.chr(65279) || pg_catalog.chr(8232) || pg_catalog.chr(8233));
$$;

CREATE FUNCTION catalog_private.verify_certification_result(
  p_method text, p_normalization text, p_expected jsonb, p_result jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  k text;
  v jsonb;
  a text;
  b text;
  n integer;
  i integer;
BEGIN
  IF p_method = 'text_answer' THEN
    IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'result must be an object' USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT jsonb_object_keys(p_expected) LOOP
      IF NOT (p_result ? k) OR jsonb_typeof(p_result -> k) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'result.% must be a string', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_object_keys(p_result)) <> (SELECT count(*) FROM jsonb_object_keys(p_expected)) THEN
      RAISE EXCEPTION 'result has unexpected fields' USING ERRCODE = '22023';
    END IF;
    FOR k, v IN SELECT * FROM jsonb_each(p_expected) LOOP
      a := catalog_private.js_trim(p_result ->> k);
      b := v #>> '{}';
      IF p_normalization = 'trim_lower' THEN
        a := pg_catalog.lower(a);
        b := pg_catalog.lower(b);
      END IF;
      IF a IS DISTINCT FROM b THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  ELSIF p_method = 'result_vector' THEN
    IF jsonb_typeof(p_result) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_result) <> jsonb_array_length(p_expected) THEN
      RAISE EXCEPTION 'result must be an array of length %', jsonb_array_length(p_expected) USING ERRCODE = '22023';
    END IF;
    n := jsonb_array_length(p_expected);
    FOR i IN 0 .. n - 1 LOOP
      IF (p_result -> i) IS DISTINCT FROM (p_expected -> i) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;
  RAISE EXCEPTION 'unknown method' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION catalog_private.validate_verification_definition(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_private.js_trim(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_private.verify_certification_result(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ===== クライアント向け RPC =====
-- 利用者は auth.uid() で特定する。未認証は 42501。業務エラーは P0001:
--   objective_not_certifiable (定義が無い・退役済み = ローカル進捗のまま) / already_certified / challenge_not_found
-- 形式の誤りの提出は 22023。

CREATE FUNCTION public.issue_certification_challenge(p_mission_id text, p_objective_id text)
RETURNS TABLE (
  challenge_id uuid,
  mission_id text,
  objective_id text,
  method text,
  inputs jsonb,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_def catalog_private.objective_verification_definitions%ROWTYPE;
  v_d jsonb;
  v_normalization text;
  v_inputs jsonb;
  v_expected jsonb;
  v_ttl integer;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 公開カタログに存在し、退役しておらず、検証定義がある目標だけが対象
  SELECT d.* INTO v_def
  FROM catalog_private.objective_verification_definitions d
  JOIN public.mission_objectives o ON o.mission_id = d.mission_id AND o.id = d.objective_id
  JOIN public.missions m ON m.id = o.mission_id
  WHERE d.mission_id = p_mission_id AND d.objective_id = p_objective_id
    AND o.retired_at IS NULL AND m.retired_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'objective_not_certifiable' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.certified_achievements a
    WHERE a.user_id = v_uid AND a.mission_id = p_mission_id AND a.objective_id = p_objective_id
  ) THEN
    RAISE EXCEPTION 'already_certified' USING ERRCODE = 'P0001';
  END IF;

  v_d := v_def.definition;
  v_ttl := coalesce((v_d ->> 'ttl_seconds')::numeric::integer, 600);

  IF v_d ->> 'method' = 'text_answer' THEN
    v_normalization := v_d ->> 'normalization';
    v_inputs := '{}'::jsonb;
    v_expected := v_d -> 'expected';
  ELSE
    -- 保存済みのケースから case_count 件を無作為に選び、入力と期待結果を同じ順序で複製する
    SELECT jsonb_agg(s.c -> 'input' ORDER BY s.r), jsonb_agg(s.c -> 'expected' ORDER BY s.r)
    INTO v_inputs, v_expected
    FROM (
      SELECT x.c, row_number() OVER (ORDER BY random()) AS r
      FROM jsonb_array_elements(v_d -> 'cases') AS x (c)
    ) s
    WHERE s.r <= (v_d ->> 'case_count')::numeric::integer;
  END IF;

  v_expires := clock_timestamp() + make_interval(secs => v_ttl);
  INSERT INTO catalog_private.certification_challenges AS c
    (user_id, mission_id, objective_id, definition_version, method, normalization, inputs, expected, expires_at)
  VALUES (v_uid, p_mission_id, p_objective_id, v_def.definition_version, v_d ->> 'method',
          v_normalization, v_inputs, v_expected, v_expires)
  RETURNING c.id INTO v_id;

  RETURN QUERY SELECT v_id, p_mission_id, p_objective_id, v_d ->> 'method', v_inputs, v_expires;
END;
$$;

CREATE FUNCTION public.submit_certification_challenge(p_challenge_id uuid, p_result jsonb)
RETURNS TABLE (
  status text,
  points_awarded integer,
  newly_certified boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_ch catalog_private.certification_challenges%ROWTYPE;
  v_correct boolean;
  v_points integer;
  v_outcome text;
  v_awarded integer;
  v_inserted integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 存在しない場合と他ユーザーのチャレンジは同じエラーにする (存在を漏らさない)。
  -- 行ロックにより、同じチャレンジへの同時提出は直列化される。
  SELECT c.* INTO v_ch
  FROM catalog_private.certification_challenges c
  WHERE c.id = p_challenge_id AND c.user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- 1. 再送 (消費済み): 保存済みの結果を返す。台帳は変更しない。
  IF v_ch.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT v_ch.outcome, v_ch.points_awarded, false;
    RETURN;
  END IF;

  -- 2. 期限切れ。now() はトランザクション内で固定されるため clock_timestamp() を使う。行は変更しない。
  IF clock_timestamp() >= v_ch.expires_at THEN
    RETURN QUERY SELECT 'expired'::text, 0, false;
    RETURN;
  END IF;

  -- 3. 照合 (形式の誤りは 22023 で例外にし、消費しない)
  v_correct := catalog_private.verify_certification_result(
    v_ch.method, v_ch.normalization, v_ch.expected, p_result);

  IF NOT v_correct THEN
    UPDATE catalog_private.certification_challenges c
    SET consumed_at = clock_timestamp(), outcome = 'incorrect', points_awarded = 0
    WHERE c.id = v_ch.id;
    RETURN QUERY SELECT 'incorrect'::text, 0, false;
    RETURN;
  END IF;

  -- 4. 正解: 加点値はその時点のサーバー側ミッション定義から読む。退役した目標は認定しない。
  SELECT o.xp INTO v_points
  FROM public.mission_objectives o
  JOIN public.missions m ON m.id = o.mission_id
  WHERE o.mission_id = v_ch.mission_id AND o.id = v_ch.objective_id
    AND o.retired_at IS NULL AND m.retired_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'objective_not_certifiable' USING ERRCODE = 'P0001';
  END IF;

  -- 台帳への記録とチャレンジの消費は同じトランザクション。別チャレンジとの競合は一意制約で 1 回だけ勝つ。
  INSERT INTO public.certified_achievements (user_id, mission_id, objective_id, points)
  VALUES (v_uid, v_ch.mission_id, v_ch.objective_id, v_points)
  ON CONFLICT ON CONSTRAINT certified_achievements_once DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    v_outcome := 'certified';
    v_awarded := v_points;
  ELSE
    v_outcome := 'already_certified';
    v_awarded := 0;
  END IF;

  UPDATE catalog_private.certification_challenges c
  SET consumed_at = clock_timestamp(), outcome = v_outcome, points_awarded = v_awarded
  WHERE c.id = v_ch.id;

  RETURN QUERY SELECT v_outcome, v_awarded, (v_inserted = 1);
END;
$$;

COMMENT ON FUNCTION public.issue_certification_challenge(text, text) IS
  'Issues an expiring challenge bound to auth.uid() and the objective. Never returns expected results.';
COMMENT ON FUNCTION public.submit_certification_challenge(uuid, jsonb) IS
  'Verifies a submitted result against the stored expected result; consumes the challenge and writes the certified_achievements ledger in one transaction. Idempotent for resubmits.';

REVOKE ALL ON FUNCTION public.issue_certification_challenge(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_certification_challenge(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_certification_challenge(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_certification_challenge(uuid, jsonb) TO authenticated;
