-- ============================================================
-- InstaRishta — Notifications (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE
-- ============================================================
--
-- Two-event model borrowed from IndiaNikah's proposal_received /
-- proposal_accepted pattern, applied to our public comment chips
-- (migration 010_channel_comments.sql) instead of private proposals:
--   comment_received     — fired to a post/story owner when someone taps a
--                           chip on it.
--   comment_acknowledged — fired back to the original commenter once the
--                           owner acknowledges. Mirrors IndiaNikah having no
--                           "declined" event either — silence stays silent,
--                           only the positive path notifies.
--
-- A single append-only table, not split per event type, so one inbox query
-- serves the bell icon regardless of which kind of row it is.

CREATE TABLE IF NOT EXISTS public.ir_notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- No FK to auth.users(id) on user_id/actor_user_id: ir_user_profiles.id
  -- (what these actually store, via ensureProfile()) has no such FK either
  -- in this app's schema — a member signed up via magic-link has no
  -- auth.users row at all.
  user_id        UUID NOT NULL, -- inbox owner / recipient
  type           TEXT NOT NULL CHECK (type IN ('comment_received', 'comment_acknowledged')),

  entity_type    TEXT NOT NULL CHECK (entity_type IN ('post', 'story')),
  entity_id      UUID NOT NULL,
  comment_id     UUID REFERENCES public.ir_comments(id) ON DELETE CASCADE,

  actor_user_id  UUID, -- who caused this notification
  actor_name     TEXT NOT NULL,                                     -- snapshot, same reasoning as ir_comments.author_name
  chip_key       TEXT,

  -- Only meaningful on a 'comment_received' row: when the recipient tapped
  -- Acknowledge, which is what fires the paired 'comment_acknowledged' row.
  responded_at   TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ir_notifications_inbox_idx  ON public.ir_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_notifications_unread_idx ON public.ir_notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS ir_notifications_comment_idx ON public.ir_notifications (comment_id);

ALTER TABLE public.ir_notifications ENABLE ROW LEVEL SECURITY;

-- Deny-all base — reads/writes go through service-role API routes, same as
-- every other ir_ table.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_notifications' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_notifications USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- A signed-in user can read their own inbox — read-only backstop, defense in
-- depth alongside the API route's own auth.uid() = user_id filtering.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_notifications' AND policyname = 'users_read_own_notifications'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_notifications ON public.ir_notifications FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ============================================================
-- Done. After running: restart the app so caches reset.
-- ============================================================
