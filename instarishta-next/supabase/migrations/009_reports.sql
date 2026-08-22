-- ============================================================
-- InstaRishta — Abuse / Misuse Reporting (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE
-- ============================================================
--
-- Backs the reporting mechanism /child-safety already promises ("any user
-- can report ... with one click", "reviewed within 2 hours") — previously
-- the only channel was mailto:/WhatsApp, with nothing in the app itself.
--
-- Generic across what's being reported: a feed listing, a registered member,
-- a post/story, a channel, or a general concern with no specific target.
-- Reporting is open to signed-in AND anonymous visitors (reporter_user_id is
-- nullable) — requiring a signup to report abuse suppresses the reports that
-- matter most. entity_id is TEXT on purpose: a feed profile id (int), a
-- member's /p/ slug, or a post/story uuid all fit without three nullable
-- id columns.

CREATE TABLE IF NOT EXISTS public.ir_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reporter_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email    TEXT,   -- from the session when signed in
  reporter_contact  TEXT,   -- optional email typed by an anonymous reporter

  entity_type       TEXT NOT NULL DEFAULT 'other'
                     CHECK (entity_type IN ('profile','member','post','story','channel','other')),
  entity_id         TEXT,
  profile_num       INT,    -- the IR # shown on cards, same convention as ir_interests

  category          TEXT NOT NULL CHECK (category IN (
                      'fake_profile','underage','harassment','scam_fraud',
                      'inappropriate_content','impersonation','spam','other'
                    )),
  description       TEXT,

  -- 'underage' (and anything else flagged urgent in lib/reports.ts) pages the
  -- team immediately instead of waiting for the admin to open the queue —
  -- matches the "reviewed within 2 hours" promise on /child-safety.
  severity          TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','urgent')),
  status            TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('open','reviewing','actioned','dismissed')),
  admin_notes       TEXT,
  resolved_by       TEXT,
  resolved_at       TIMESTAMPTZ,

  ip_address        TEXT,   -- best-effort, for spam-brake correlation only
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ir_reports_status_idx    ON public.ir_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_reports_entity_idx    ON public.ir_reports (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ir_reports_reporter_idx  ON public.ir_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_reports_ip_idx        ON public.ir_reports (ip_address, created_at DESC);

ALTER TABLE public.ir_reports ENABLE ROW LEVEL SECURITY;

-- Deny-all base — same pattern as ir_interests / ir_user_profiles. The public
-- submission route and the /nizam queue both go through the service-role
-- client, so this is a backstop against any direct client access.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_reports' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_reports USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- A signed-in reporter can see the status of reports they filed (e.g. from
-- /account) — read-only, and only their own rows.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_reports' AND policyname = 'users_read_own_reports'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_reports ON public.ir_reports FOR SELECT USING (auth.uid() = reporter_user_id)';
  END IF;
END $$;

-- ============================================================
-- Done. After running: restart the app so caches reset.
-- ============================================================
