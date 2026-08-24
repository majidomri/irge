-- ============================================================
-- InstaRishta — Profession verification, cohort channels, story views
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE
-- ============================================================
--
-- This migration turns InstaRishta from "a matrimony site with a filter"
-- into a *selective* one. Three pieces, in dependency order:
--
--   1. ir_verification_requests — a member submits a profession claim plus
--      proof (MCI/NMC reg. no., ICAI membership, bar council ID, degree
--      certificate, corporate email). An admin approves or REJECTS it.
--      Rejection is a real, recorded outcome — not a soft "pending forever".
--      That is the whole point: if nobody is ever rejected, the gate is not
--      real and members find out fast.
--
--   2. ir_channels.is_cohort / profession_key — cohort circles (Doctors,
--      CAs, Civil Services, IIT/IIM, Founders) reuse the existing channel
--      table rather than a parallel ir_cohorts model, so the channel page,
--      post grid and story plumbing all work unchanged. The one pre-existing
--      content channel stays is_cohort = false and is unaffected.
--
--   3. ir_story_views — per-viewer story reads, which give us both the
--      "seen by" list for the owner and the watched/unwatched ring state for
--      the viewer. Stories already expire after 24h in /api/stories
--      (STORY_WINDOW_MS), so this table only ever holds a small live window
--      plus whatever the reaper has not yet cleaned.
--
-- RLS throughout follows the house pattern (see 011_notifications.sql):
-- deny-all base policy, with narrow read-own backstops. Every write goes
-- through a service-role API route.

-- ══════════════════════════════════════════════════════════════
-- 1. PROFESSION ON THE PROFILE
-- ══════════════════════════════════════════════════════════════
-- profession_key is the *approved* profession and is NULL until an admin
-- approves a request. It is deliberately not set from the user's claim —
-- the claim lives on ir_verification_requests until it is reviewed, so an
-- unverified member can never render a badge.

ALTER TABLE public.ir_user_profiles
  ADD COLUMN IF NOT EXISTS profession_key        TEXT,
  ADD COLUMN IF NOT EXISTS profession_verified_at TIMESTAMPTZ;

-- Partial index: only verified members are ever filtered by profession, and
-- they are the minority of rows. Keeps the index small as the table grows.
CREATE INDEX IF NOT EXISTS ir_user_profiles_profession_idx
  ON public.ir_user_profiles (profession_key)
  WHERE profession_key IS NOT NULL;


-- ══════════════════════════════════════════════════════════════
-- 2. VERIFICATION REQUESTS (manual admin review)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ir_verification_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- No FK to auth.users(id), matching ir_notifications: a magic-link member
  -- has an ir_user_profiles row but no auth.users row in this app's schema.
  user_id         UUID NOT NULL,

  profession_key  TEXT NOT NULL,

  -- What was submitted as proof. doc_url points at a private Supabase
  -- Storage object — never a public bucket, these are identity documents.
  doc_type        TEXT NOT NULL CHECK (doc_type IN (
                    'registration_no', 'membership_no', 'degree_certificate',
                    'employment_letter', 'corporate_email', 'other')),
  doc_url         TEXT,
  doc_reference   TEXT,          -- the registration/membership number itself
  note            TEXT,          -- free text from the applicant

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason   TEXT,
  reviewed_by     TEXT,          -- admin email (see isAdminEmail in lib/auth.ts)
  reviewed_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A rejected or approved row is history and must be kept; only *one*
-- request may be in flight per member at a time. A partial unique index
-- enforces that without blocking re-application after a rejection.
CREATE UNIQUE INDEX IF NOT EXISTS ir_verification_one_pending_per_user
  ON public.ir_verification_requests (user_id)
  WHERE status = 'pending';

-- The admin review queue: oldest pending first, so nobody waits forever.
CREATE INDEX IF NOT EXISTS ir_verification_queue_idx
  ON public.ir_verification_requests (created_at)
  WHERE status = 'pending';

-- FK-shaped lookup column, indexed per schema-foreign-key-indexes.
CREATE INDEX IF NOT EXISTS ir_verification_user_idx
  ON public.ir_verification_requests (user_id, created_at DESC);

ALTER TABLE public.ir_verification_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_verification_requests' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_verification_requests USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- Read-own backstop. auth.uid() is wrapped in a SELECT so it is evaluated
-- once per query rather than once per row (security-rls-performance).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_verification_requests' AND policyname = 'users_read_own_verification'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_verification ON public.ir_verification_requests FOR SELECT USING ((SELECT auth.uid()) = user_id)';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- 3. COHORT CHANNELS
-- ══════════════════════════════════════════════════════════════
-- ir_channels gains two columns. Existing rows default to is_cohort = false
-- and keep behaving exactly as before.
--
-- member_count is a denormalised counter maintained by the approval path and
-- reconciled by a cron job (pass 2). It is published publicly — "412 verified
-- doctors" — so it must be cheap to read on every page load; counting
-- ir_user_profiles per request would not be.

ALTER TABLE public.ir_channels
  ADD COLUMN IF NOT EXISTS is_cohort      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profession_key TEXT,
  ADD COLUMN IF NOT EXISTS member_count   INT     NOT NULL DEFAULT 0;

-- One cohort per profession. Partial, so the many non-cohort channels are
-- exempt and may all keep profession_key NULL.
CREATE UNIQUE INDEX IF NOT EXISTS ir_channels_one_cohort_per_profession
  ON public.ir_channels (profession_key)
  WHERE is_cohort;

-- Seed the five launch cohorts. ON CONFLICT DO NOTHING keys off the existing
-- unique slug, so re-running never duplicates or clobbers admin edits.
INSERT INTO public.ir_channels (name, slug, description, is_cohort, profession_key)
VALUES
  ('Doctors',        'doctors',        'Verified doctors and surgeons.',              true, 'doctor'),
  ('Chartered Accountants', 'chartered-accountants', 'Verified CAs and CFAs.',        true, 'ca'),
  ('Civil Services', 'civil-services', 'Verified IAS, IPS, IFS and allied services.', true, 'civil_services'),
  ('IIT / IIM',      'iit-iim',        'Verified IIT and IIM alumni.',                true, 'iit_iim'),
  ('Founders',       'founders',       'Verified founders and business owners.',      true, 'founder')
ON CONFLICT (slug) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- 4. STORY VIEWS (seen-by + ring decay)
-- ══════════════════════════════════════════════════════════════
-- One row per (story, viewer). The composite primary key is the dedupe
-- mechanism — re-watching a story is an idempotent upsert, not a new row —
-- and it doubles as the index for "who viewed this story".

CREATE TABLE IF NOT EXISTS public.ir_story_views (
  story_id   UUID NOT NULL REFERENCES public.ir_stories(id) ON DELETE CASCADE,
  viewer_id  UUID NOT NULL,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- The PK covers story_id-leading lookups (the owner's "seen by" list).
-- This second index serves the other direction: "which of these stories has
-- the current viewer already seen", which drives the watched/unwatched ring.
CREATE INDEX IF NOT EXISTS ir_story_views_viewer_idx
  ON public.ir_story_views (viewer_id, story_id);

ALTER TABLE public.ir_story_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_story_views' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_story_views USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- A member may read the rows recording their *own* viewing. The owner's
-- "seen by" list is deliberately NOT exposed here — it needs a join against
-- ir_stories.user_id to authorise, so it goes through the service-role route
-- only.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_story_views' AND policyname = 'users_read_own_story_views'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_story_views ON public.ir_story_views FOR SELECT USING ((SELECT auth.uid()) = viewer_id)';
  END IF;
END $$;

-- ============================================================
-- Done. After running: restart the app so caches reset.
-- ============================================================
