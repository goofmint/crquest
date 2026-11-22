-- チーム・オペレーションの参加と貢献集計 (Issue #188)
--
-- チームとオペレーションは kind で区別する共通の groups テーブルで表す。
-- 操作はすべて SECURITY DEFINER の RPC (auth.uid() で本人を特定) 経由で、テーブルへの直接アクセスは拒否する。
-- certified_achievements は「サーバーが認定した達成」の台帳で、クライアントの書き込み経路は存在しない。
-- 書き込み主体は後続の認定処理 (#189) が決める。cloud_saves の自己申告データは集計に使わない。
-- 規則の全体は docs/supabase/teams-operations.md。

CREATE TYPE public.group_kind AS ENUM ('team', 'operation');

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.group_kind NOT NULL,
  display_name text NOT NULL,
  join_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_display_name_not_blank CHECK (btrim(display_name) <> ''),
  -- 参加コードは正規化済み (前後の空白なし・大文字) で保存し、推測しにくいよう 6 文字以上にする
  CONSTRAINT groups_join_code_normalized CHECK (
    join_code = upper(btrim(join_code, E' \t\r\n')) AND char_length(join_code) >= 6
  ),
  CONSTRAINT groups_kind_join_code_key UNIQUE (kind, join_code)
);

COMMENT ON TABLE public.groups IS
  'Teams and operations (kind). Created by operators (service role / SQL); clients cannot write.';

CREATE TABLE public.group_memberships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  left_at timestamptz,
  CONSTRAINT group_memberships_period CHECK (left_at IS NULL OR left_at >= joined_at)
);

-- アクティブな所属 (left_at IS NULL) の重複を防ぐ。離脱済みの行は履歴として残り、再加入は新しい行になる。
CREATE UNIQUE INDEX group_memberships_active_key
  ON public.group_memberships (group_id, user_id) WHERE left_at IS NULL;
CREATE INDEX group_memberships_user_period_idx
  ON public.group_memberships (user_id, joined_at, left_at);

COMMENT ON TABLE public.group_memberships IS
  'Membership history. A row is never deleted on leave (left_at is set) so contributions earned while a member are kept.';

-- サーバーが認定した達成の台帳。チーム貢献の唯一の集計元。#189 (認定) と #190 (ランキング) が再利用する。
CREATE TABLE public.certified_achievements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  mission_id text NOT NULL,
  objective_id text NOT NULL,
  points integer NOT NULL,
  certified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certified_achievements_points_nonnegative CHECK (points >= 0),
  CONSTRAINT certified_achievements_once UNIQUE (user_id, mission_id, objective_id)
);

CREATE INDEX certified_achievements_user_time_idx
  ON public.certified_achievements (user_id, certified_at);

COMMENT ON TABLE public.certified_achievements IS
  'Server-certified achievements. No client write path. points is the value at certification time and is never recomputed.';

-- 3 テーブルとも RLS を有効にし、許可ポリシーも権限も与えない (アクセスは RPC だけ)。
-- service_role とテーブル所有者は RLS を迂回する。
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certified_achievements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.groups, public.group_memberships, public.certified_achievements
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.group_memberships_id_seq, public.certified_achievements_id_seq
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC。利用者は引数ではなく auth.uid() で特定する (他ユーザーの代理操作は構造的に不可能)。
-- 未認証は 42501、業務エラーは P0001 とメッセージ invalid_join_code / already_member / not_member。
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.join_group(p_kind public.group_kind, p_join_code text)
RETURNS TABLE (
  group_id uuid,
  kind public.group_kind,
  display_name text,
  join_code text,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_join_code, ''), E' \t\r\n'));
  v_group public.groups%ROWTYPE;
  v_joined_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- コードの存在有無を漏らさないため、未存在と kind 違いは同じエラーにする
  SELECT g.* INTO v_group
  FROM public.groups g
  WHERE g.kind = p_kind AND g.join_code = v_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_join_code' USING ERRCODE = 'P0001';
  END IF;

  -- 同じ (group_id, user_id) の加入・離脱を直列化してから時刻を確定する
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_group.id::text || ':' || v_uid::text, 0)
  );

  BEGIN
    INSERT INTO public.group_memberships (group_id, user_id)
    VALUES (v_group.id, v_uid)
    RETURNING group_memberships.joined_at INTO v_joined_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0001';
  END;

  RETURN QUERY
  SELECT v_group.id, v_group.kind, v_group.display_name, v_group.join_code, v_joined_at;
END;
$$;

CREATE FUNCTION public.leave_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- join_group と同じロックで直列化してから離脱時刻を確定する
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_group_id::text || ':' || v_uid::text, 0)
  );

  -- 自分のアクティブな所属だけを更新する。行は削除しない (離脱前の貢献を残すため)。
  UPDATE public.group_memberships m
  SET left_at = clock_timestamp()
  WHERE m.group_id = p_group_id AND m.user_id = v_uid AND m.left_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION public.list_my_groups(p_kind public.group_kind DEFAULT NULL)
RETURNS TABLE (
  group_id uuid,
  kind public.group_kind,
  display_name text,
  join_code text,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, g.kind, g.display_name, g.join_code, m.joined_at
  FROM public.group_memberships m
  JOIN public.groups g ON g.id = m.group_id
  WHERE m.user_id = auth.uid()
    AND m.left_at IS NULL
    AND (p_kind IS NULL OR g.kind = p_kind)
  ORDER BY m.joined_at, g.id;
END;
$$;

-- 認定時刻 (certified_at) が、同じ利用者の所属期間 [joined_at, left_at) に入る達成だけを数える。
-- 所属中に得た貢献は離脱後も残る。メンバー別の内訳とユーザー ID は返さない。
CREATE FUNCTION public.get_group_contribution(p_group_id uuid)
RETURNS TABLE (
  total_points bigint,
  achievement_count bigint,
  contributor_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_memberships m
    WHERE m.group_id = p_group_id AND m.user_id = auth.uid() AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    coalesce(sum(a.points), 0)::bigint,
    count(a.id)::bigint,
    count(DISTINCT a.user_id)::bigint
  FROM public.group_memberships m
  JOIN public.certified_achievements a
    ON a.user_id = m.user_id
   AND a.certified_at >= m.joined_at
   AND (m.left_at IS NULL OR a.certified_at < m.left_at)
  WHERE m.group_id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_group(public.group_kind, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_group(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_groups(public.group_kind) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_contribution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group(public.group_kind, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_groups(public.group_kind) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_contribution(uuid) TO authenticated;
