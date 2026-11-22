-- クラウドセーブ (Issue #187)
--
-- ユーザーごとに 1 行。所有者は Supabase Auth のユーザー (auth.uid()) で、本人だけが読み書きできる。
-- 書き込みは SECURITY INVOKER の RPC (upsert_cloud_save) 経由。revision と updated_at は
-- サーバー (トリガー) だけが決める。競合時は「最後にサーバーが受け付けた書き込み」が勝つ
-- (同じ行への同時書き込みは行ロックで直列化され、revision が単調に増える)。
--
-- 注意: ここに入るのはクライアントが自己申告したデータである。ランキングやチームスコアの
-- 加点元にしてはならない (docs/supabase/cloud-save.md)。

CREATE TABLE public.cloud_saves (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users (id) ON DELETE CASCADE
    DEFAULT auth.uid(),
  data jsonb NOT NULL,
  schema_version integer NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cloud_saves_data_is_object CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT cloud_saves_data_size CHECK (octet_length(data::text) <= 2097152),
  CONSTRAINT cloud_saves_schema_version_positive CHECK (schema_version >= 1)
);

COMMENT ON TABLE public.cloud_saves IS
  'Self-reported game save, one row per Auth user. NOT a trusted source: never use it for rankings or team scores.';

ALTER TABLE public.cloud_saves ENABLE ROW LEVEL SECURITY;

-- 権限: 読み取りは本人 (RLS) のみ。書き込みは列単位で data / schema_version だけ。
-- user_id は DEFAULT auth.uid() で決まり、クライアントは指定できない。DELETE は付与しない。
GRANT SELECT ON public.cloud_saves TO authenticated;
GRANT INSERT (data, schema_version) ON public.cloud_saves TO authenticated;
GRANT UPDATE (data, schema_version) ON public.cloud_saves TO authenticated;

CREATE POLICY cloud_saves_select_own ON public.cloud_saves
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY cloud_saves_insert_own ON public.cloud_saves
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY cloud_saves_update_own ON public.cloud_saves
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- revision / updated_at / 所有者はサーバーが決める。クライアントの値はすべて上書きする。
CREATE FUNCTION public.cloud_saves_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    NEW.created_at := now();
  ELSE
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.revision := OLD.revision + 1;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloud_saves_server_fields
  BEFORE INSERT OR UPDATE ON public.cloud_saves
  FOR EACH ROW EXECUTE FUNCTION public.cloud_saves_server_fields();

-- 書き込み RPC。SECURITY INVOKER なので RLS と列権限がそのまま効く。
CREATE FUNCTION public.upsert_cloud_save(p_data jsonb, p_schema_version integer)
RETURNS TABLE (revision bigint, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  INSERT INTO public.cloud_saves AS cs (data, schema_version)
  VALUES (p_data, p_schema_version)
  ON CONFLICT (user_id) DO UPDATE
    SET data = EXCLUDED.data,
        schema_version = EXCLUDED.schema_version
  RETURNING cs.revision, cs.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_cloud_save(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_cloud_save(jsonb, integer) TO authenticated;
