-- ============================================================
-- InstaRishta — Drop stale auth.users FK on posts/stories (idempotent)
-- ============================================================
--
-- Same root cause as 009/010/011's auth.users FK fix: ir_posts.user_id and
-- ir_stories.user_id were declared REFERENCES auth.users(id) in
-- 001_full_schema.sql, but what they actually store (via ensureProfile() /
-- ir_sync_profile) is ir_user_profiles.id — which has no FK to auth.users in
-- this database (ir_user_profiles.id's own declared FK to auth.users never
-- took effect in production either; see 001's comment vs. reality).
--
-- A member who signed up via magic-link has no auth.users row at all, so
-- attributing a post/story to them — e.g. via /nizam's "Owner's email" field
-- (added after 012) — would fail with a foreign-key violation. Caught while
-- seeding demo content for a magic-link-created account.

ALTER TABLE public.ir_posts   DROP CONSTRAINT IF EXISTS ir_posts_user_id_fkey;
ALTER TABLE public.ir_stories DROP CONSTRAINT IF EXISTS ir_stories_user_id_fkey;
