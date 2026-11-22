-- ライブイベントと個人・チーム公開ランキング (Issue #190)
--
-- 構成:
--   * イベント設定      : public.live_events (運用者だけが作成。クライアントの書き込み経路なし)
--   * 参加記録          : public.live_event_participants (本人が RPC で作成。公開表示名と表示の可否は本人が明示する)
--   * 集計元            : public.certified_achievements (#188 の台帳。#189 の認定 RPC だけが書く)。イベント専用の書き込みは持たない
--   * 公開読み取り      : list_live_events / get_live_event_ranking / get_live_event_team_ranking (anon 可)
--   * 本人向け          : join_live_event / update_live_event_participation / get_my_live_event_status (authenticated のみ)
-- クラウドセーブ (自己申告) と Auth の user_metadata は参加・集計・公開のどれにも使わない。
-- 規則の全体は docs/supabase/live-events.md。
--
-- エラー: 未認証は 42501 'not authenticated'、業務エラーは P0001 とメッセージ
--   event_not_found / event_closed / not_eligible / invalid_display_name / already_participant / not_participant

CREATE TYPE public.live_event_status AS ENUM ('draft', 'published');

CREATE TABLE public.live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.live_event_status NOT NULL DEFAULT 'draft',
  -- 設定すると、そのグループ (例: オペレーション) のアクティブなメンバーだけが参加できる。公開 API には出さない
  required_group_id uuid REFERENCES public.groups (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_events_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT live_events_period CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.live_events IS
  'Live events. Created by operators (service role / SQL); clients cannot write. Period is the half-open interval [starts_at, ends_at) on the server clock.';

CREATE TABLE public.live_event_participants (
  event_id uuid NOT NULL REFERENCES public.live_events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- 利用者が明示した公開表示名。OAuth の名前やメールは使わない。一意にはしない
  display_name text NOT NULL,
  show_in_ranking boolean NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT live_event_participants_name_length
    CHECK (char_length(display_name) BETWEEN 1 AND 32 AND display_name = btrim(display_name)),
  -- 制御文字、双方向制御、ゼロ幅、行区切りを拒否する
  CONSTRAINT live_event_participants_name_printable
    CHECK (display_name !~ E'[\\x01-\\x1f\\x7f-\\x9f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]')
);

CREATE INDEX live_event_participants_user_idx ON public.live_event_participants (user_id);

COMMENT ON TABLE public.live_event_participants IS
  'Event participation made by the user via RPC. display_name is what the user chose to publish. joined_at starts the scoring window.';

ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_event_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_events, public.live_event_participants FROM PUBLIC, anon, authenticated;

-- 集計の共通処理。API には公開しない (所有者の SECURITY DEFINER RPC からだけ呼ぶ)。
CREATE SCHEMA ranking_private;
REVOKE ALL ON SCHEMA ranking_private FROM PUBLIC, anon, authenticated;

COMMENT ON SCHEMA ranking_private IS
  'Shared scoring helpers for live event rankings. Not exposed through the Data API.';

-- 参加者ごとの得点。計上対象は、参加者本人の認定達成のうち
--   certified_at が [greatest(starts_at, joined_at), least(ends_at, p_now)) に入るもの。
-- 台帳の points (認定時点の値) を合計する。参加前、開始前、終了後、p_now より後 (将来時刻) の行は除く。
CREATE FUNCTION ranking_private.participant_scores(p_event_id uuid, p_now timestamptz)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  show_in_ranking boolean,
  score bigint,
  achievement_count bigint
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p.user_id, p.display_name, p.show_in_ranking,
         coalesce(sum(a.points), 0)::bigint,
         count(a.id)::bigint
  FROM public.live_event_participants p
  JOIN public.live_events e ON e.id = p.event_id
  LEFT JOIN public.certified_achievements a
    ON a.user_id = p.user_id
   AND a.certified_at >= greatest(e.starts_at, p.joined_at)
   AND a.certified_at < least(e.ends_at, p_now)
  WHERE p.event_id = p_event_id
  GROUP BY p.user_id, p.display_name, p.show_in_ranking
$$;

-- チームごとの得点。計上対象の達成 (上と同じ窓) を、certified_at が所属期間 [joined_at, left_at) に入る
-- チームへ計上する。複数チームに所属していれば各チームに計上する。
-- 同じチームの重複した所属履歴で二重計上しないよう、(達成, チーム) の組は DISTINCT で 1 回にする。
-- 表示しない参加者の達成もチームには計上する。
CREATE FUNCTION ranking_private.team_scores(p_event_id uuid, p_now timestamptz)
RETURNS TABLE (
  group_id uuid,
  display_name text,
  score bigint,
  achievement_count bigint,
  contributor_count bigint
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT g.id, g.display_name,
         sum(w.points)::bigint,
         count(*)::bigint,
         count(DISTINCT w.user_id)::bigint
  FROM (
    SELECT a.id, a.user_id, a.points, a.certified_at
    FROM public.live_event_participants p
    JOIN public.live_events e ON e.id = p.event_id
    JOIN public.certified_achievements a
      ON a.user_id = p.user_id
     AND a.certified_at >= greatest(e.starts_at, p.joined_at)
     AND a.certified_at < least(e.ends_at, p_now)
    WHERE p.event_id = p_event_id
  ) w
  CROSS JOIN LATERAL (
    SELECT DISTINCT m.group_id
    FROM public.group_memberships m
    WHERE m.user_id = w.user_id
      AND w.certified_at >= m.joined_at
      AND (m.left_at IS NULL OR w.certified_at < m.left_at)
  ) mg
  JOIN public.groups g ON g.id = mg.group_id AND g.kind = 'team'
  GROUP BY g.id, g.display_name
$$;

REVOKE ALL ON FUNCTION ranking_private.participant_scores(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ranking_private.team_scores(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ===== 公開読み取り (anon / authenticated) =====

-- 公開中のイベントだけ。required_group_id は返さない。
-- phase: upcoming (開始前) / active / ended。is_open: 参加を受け付けているか (公開中かつ now < ends_at)。
CREATE FUNCTION public.list_live_events()
RETURNS TABLE (
  event_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  phase text,
  is_open boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  SELECT e.id, e.title, e.starts_at, e.ends_at,
         CASE WHEN v_now < e.starts_at THEN 'upcoming'
              WHEN v_now < e.ends_at THEN 'active'
              ELSE 'ended' END,
         v_now < e.ends_at
  FROM public.live_events e
  WHERE e.status = 'published'
  ORDER BY e.starts_at DESC, e.id
  LIMIT 100;
END;
$$;

-- 個人ランキング。表示を選んだ参加者だけ (0 点も含む)。順位はスコア降順の RANK() (同点は同順位、次は飛ぶ)、
-- 同点内の並びは内部 ID で固定する。limit は 1〜100 (既定 50)、offset は 0 以上。total_count は表示対象の総数。
CREATE FUNCTION public.get_live_event_ranking(
  p_event_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  rank bigint,
  display_name text,
  score bigint,
  achievement_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_events e WHERE e.id = p_event_id AND e.status = 'published'
  ) THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT r.rank, r.display_name, r.score, r.achievement_count, r.total_count
  FROM (
    SELECT rank() OVER (ORDER BY s.score DESC) AS rank,
           s.display_name, s.score, s.achievement_count,
           count(*) OVER () AS total_count,
           s.user_id
    FROM ranking_private.participant_scores(p_event_id, v_now) s
    WHERE s.show_in_ranking
  ) r
  ORDER BY r.rank, r.user_id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

-- チームランキング。計上対象の達成が 1 件以上あるチームだけ。チームの表示名、スコア、達成数、貢献者数を返す。
-- グループ ID、参加コード、メンバーは返さない。順位・ページングは個人ランキングと同じ。
CREATE FUNCTION public.get_live_event_team_ranking(
  p_event_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  rank bigint,
  display_name text,
  score bigint,
  achievement_count bigint,
  contributor_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_events e WHERE e.id = p_event_id AND e.status = 'published'
  ) THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT r.rank, r.display_name, r.score, r.achievement_count, r.contributor_count, r.total_count
  FROM (
    SELECT rank() OVER (ORDER BY t.score DESC) AS rank,
           t.display_name, t.score, t.achievement_count, t.contributor_count,
           count(*) OVER () AS total_count,
           t.group_id
    FROM ranking_private.team_scores(p_event_id, v_now) t
  ) r
  ORDER BY r.rank, r.group_id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

-- ===== 本人向け (authenticated のみ) =====

CREATE FUNCTION public.join_live_event(
  p_event_id uuid,
  p_display_name text,
  p_show_in_ranking boolean
)
RETURNS TABLE (
  event_id uuid,
  display_name text,
  show_in_ranking boolean,
  joined_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_event public.live_events%ROWTYPE;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_joined_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 下書きと存在しないイベントは区別しない
  SELECT e.* INTO v_event
  FROM public.live_events e
  WHERE e.id = p_event_id AND e.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- 同じ (event, user) の参加を直列化する (join_group と同じ方法)。ロック待ちの間に終了時刻を
  -- 過ぎることがあるため、受付の判定はロック取得後に実時刻を読み直して行う。
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('live_event:' || p_event_id::text || ':' || v_uid::text, 0)
  );

  -- 受付は終了時刻まで (半開区間。猶予なし)。開始前の参加は可能で、計上は開始時刻から。
  IF clock_timestamp() >= v_event.ends_at THEN
    RAISE EXCEPTION 'event_closed' USING ERRCODE = 'P0001';
  END IF;

  IF v_event.required_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_memberships m
    WHERE m.group_id = v_event.required_group_id AND m.user_id = v_uid AND m.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_eligible' USING ERRCODE = 'P0001';
  END IF;

  IF p_show_in_ranking IS NULL OR v_name = ''
     OR char_length(v_name) > 32
     OR v_name ~ E'[\\x01-\\x1f\\x7f-\\x9f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]' THEN
    RAISE EXCEPTION 'invalid_display_name' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.live_event_participants (event_id, user_id, display_name, show_in_ranking)
    VALUES (p_event_id, v_uid, v_name, p_show_in_ranking)
    RETURNING live_event_participants.joined_at INTO v_joined_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_participant' USING ERRCODE = 'P0001';
  END;

  RETURN QUERY SELECT p_event_id, v_name, p_show_in_ranking, v_joined_at;
END;
$$;

-- 本人の公開表示名と表示の可否だけを変える (NULL の引数は変更しない)。終了後も、表示を止める目的で変更できる。
-- joined_at は変えないので、計上期間は動かない。
CREATE FUNCTION public.update_live_event_participation(
  p_event_id uuid,
  p_display_name text DEFAULT NULL,
  p_show_in_ranking boolean DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  display_name text,
  show_in_ranking boolean,
  joined_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(p_display_name);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_events e WHERE e.id = p_event_id AND e.status = 'published'
  ) THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_display_name IS NOT NULL AND (
       v_name = '' OR char_length(v_name) > 32
       OR v_name ~ E'[\\x01-\\x1f\\x7f-\\x9f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]'
     ) THEN
    RAISE EXCEPTION 'invalid_display_name' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  UPDATE public.live_event_participants p
  SET display_name = coalesce(v_name, p.display_name),
      show_in_ranking = coalesce(p_show_in_ranking, p.show_in_ranking)
  WHERE p.event_id = p_event_id AND p.user_id = v_uid
  RETURNING p.event_id, p.display_name, p.show_in_ranking, p.joined_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- 本人の参加状況、スコア、順位。参加していなければ joined = false。
-- 表示しない参加者には順位を返さない (rank は NULL)。順位は個人ランキングと同じ規則。
CREATE FUNCTION public.get_my_live_event_status(p_event_id uuid)
RETURNS TABLE (
  joined boolean,
  display_name text,
  show_in_ranking boolean,
  score bigint,
  achievement_count bigint,
  rank bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_events e WHERE e.id = p_event_id AND e.status = 'published'
  ) THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH s AS (
    SELECT x.user_id, x.display_name, x.show_in_ranking, x.score, x.achievement_count,
           CASE WHEN x.show_in_ranking
                THEN rank() OVER (PARTITION BY x.show_in_ranking ORDER BY x.score DESC)
           END AS rank
    FROM ranking_private.participant_scores(p_event_id, v_now) x
  )
  SELECT true, s.display_name, s.show_in_ranking, s.score, s.achievement_count, s.rank
  FROM s WHERE s.user_id = v_uid
  UNION ALL
  SELECT false, NULL::text, NULL::boolean, 0::bigint, 0::bigint, NULL::bigint
  WHERE NOT EXISTS (SELECT 1 FROM s WHERE s.user_id = v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.list_live_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_live_event_ranking(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_live_event_team_ranking(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_live_event(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_live_event_participation(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_live_event_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_live_events() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_event_ranking(uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_event_team_ranking(uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_live_event(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_live_event_participation(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_live_event_status(uuid) TO authenticated;
