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
