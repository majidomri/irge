-- ============================================================
-- InstaRishta — CRITICAL: lock down ir_posts/ir_stories/ir_channels RLS
-- ============================================================
--
-- ir_posts/ir_stories/ir_channels allowed ANY authenticated member to
-- INSERT or DELETE ANY row, with zero ownership check:
--   auth.role() = 'authenticated'  -- the entire condition, on all of these
--
-- /api/auth/supabase-token mints a real Supabase JWT with role:'authenticated'
-- for every signed-in member (gated only by having a session, not by being
-- admin — see src/lib/supabase-token.ts + src/app/api/auth/supabase-token/route.ts,
-- and src/lib/hooks/useRealtimeProfile.ts for the app's own legitimate use of
-- that same token). That token, replayed directly against PostgREST, satisfied
-- these policies: any signed-up member could delete or forge any post/story/
-- channel platform-wide — no admin privilege required.
--
-- Confirmed dead capability before dropping: grepped the whole app for
-- deletePost()/createStory() (the client-side helpers these policies exist
-- for) — nothing calls them. Every real write already goes through
-- service-role, admin-gated routes (/api/admin/posts, /api/admin/stories,
-- /api/admin/channels via withAdmin). Dropping these restores the same
-- deny-by-default posture already used by every other table in this app
-- (ir_reports, ir_comments, ir_notifications, ir_interests, ir_orders) — RLS
-- stays enabled, only the public SELECT policies remain, so reads (the
-- channel feed, story tray, etc.) are unaffected.
--
-- Found via a full-codebase bug audit; applied directly to production
-- 2026-08-22 given the severity (live, exploitable, no admin privilege
-- required). This file documents that change for migration history.

DROP POLICY IF EXISTS ir_posts_auth_insert    ON public.ir_posts;
DROP POLICY IF EXISTS ir_posts_auth_delete    ON public.ir_posts;
DROP POLICY IF EXISTS ir_stories_auth_insert  ON public.ir_stories;
DROP POLICY IF EXISTS ir_stories_auth_delete  ON public.ir_stories;
DROP POLICY IF EXISTS ir_channels_auth_insert ON public.ir_channels;
