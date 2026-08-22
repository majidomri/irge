-- ============================================================
-- InstaRishta — Channel Post/Story Comments (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE
-- ============================================================
--
-- Public, fixed-vocabulary comments on ir_posts / ir_stories — see
-- src/lib/comment-chips.ts. Unlike ir_interests (private, /profiles), these
-- ARE shown publicly under the post, so:
--   - Requires a signed-in author (unlike the anonymous like button) so a
--     bad actor is an accountable, bannable account, not a device.
--   - No free text — same reasoning as interests: a public comment box under
--     a real person's photo is a permanent harassment surface.
--   - Soft-deleted (hidden), never hard-deleted, so a moderation action
--     leaves an audit trail.

CREATE TABLE IF NOT EXISTS public.ir_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type   TEXT NOT NULL DEFAULT 'post' CHECK (entity_type IN ('post', 'story')),
  entity_id     UUID NOT NULL,

  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name   TEXT NOT NULL, -- snapshot at post time — a later name change must not rewrite history

  chip_key      TEXT NOT NULL CHECK (chip_key IN ('interested', 'view_profile', 'is_done', 'answer_asap')),

  hidden        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- One tap of each chip per user per post. Stops the obvious spam vector
  -- (mashing "I am interested" 50 times) without needing a rate-limit table —
  -- the fixed 4-chip vocabulary already caps how many times one person can
  -- comment on the same post.
  UNIQUE (entity_type, entity_id, user_id, chip_key)
);

CREATE INDEX IF NOT EXISTS ir_comments_entity_idx ON public.ir_comments (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_comments_user_idx   ON public.ir_comments (user_id, created_at DESC);

ALTER TABLE public.ir_comments ENABLE ROW LEVEL SECURITY;

-- Deny-all base — same pattern as every other ir_ table. Public visibility
-- (only non-hidden rows) is enforced by the SELECT the /api/comments route
-- runs, not by RLS, since there is no direct client access to this table at
-- all (consistent with ir_interests / ir_reports).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_comments' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_comments USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ============================================================
-- Done. After running: restart the app so caches reset.
-- ============================================================
