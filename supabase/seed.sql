-- 合成シード: db reset のたびに同じ内容を再現する。
--
-- ここにあるのは実在しない合成プレースホルダーユーザーである。
-- パスワードを持たないため、サインインには使えない (将来の user_id 外部キーの参照先用)。
-- ログインが必要な検証は、Auth API で都度ユーザーを作る (tasks/supabase_smoke/)。
-- 実データ、実在のセーブ、GUID、Firebase のデータ、資格情報は入れない。
-- メールアドレスは予約ドメイン example.test を使う。

INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'synthetic-player-1@example.test', '{"display_name": "Synthetic Player 1"}', now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'synthetic-player-2@example.test', '{"display_name": "Synthetic Player 2"}', now(), now()),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'synthetic-player-3@example.test', '{"display_name": "Synthetic Player 3"}', now(), now())
ON CONFLICT (id) DO NOTHING;

-- チーム・オペレーション (Issue #188): smoke 検証用の合成グループ。参加コードは公開してよい固定値。
INSERT INTO public.groups (id, kind, display_name, join_code)
VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'team', 'Synthetic Team', 'SMOKETEAM1'),
  ('00000000-0000-4000-8000-0000000000b1', 'operation', 'Synthetic Operation', 'SMOKEOPS01')
ON CONFLICT (id) DO NOTHING;
