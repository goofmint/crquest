-- RLS 前提の権限の初期設定 (Issue #185)
--
-- 製品テーブルはここでは作成しない。各機能のマイグレーション (#186 以降) が作る。
-- このマイグレーションは「postgres が将来作るオブジェクトは、既定では API ロール
-- (anon / authenticated) に公開されない」状態にするだけである。
--
-- 将来のテーブルは次の順で作る:
--   1. CREATE TABLE
--   2. ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--   3. 必要最小限の GRANT (例: GRANT SELECT, INSERT ON ... TO authenticated)
--   4. auth.uid() によるポリシー (例: USING (user_id = (select auth.uid())))
-- RPC (関数) も、呼び出させたいロールへ EXECUTE を明示的に GRANT する。
--
-- service_role の既定権限、public スキーマに対する USAGE、および auth / storage /
-- realtime スキーマと supabase_admin の既定権限は変更しない。

-- テーブル、シーケンス、関数: public スキーマで postgres が作成するもの
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 関数の EXECUTE は PostgreSQL 既定で PUBLIC に付く。postgres が作る関数については外す。
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
