-- ============================================================
-- InstaRishta — Professions as data (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: IF NOT EXISTS / OR REPLACE / ON CONFLICT throughout
-- ============================================================
--
-- Migration 015 hardcoded the profession vocabulary in TypeScript
-- (src/lib/professions.ts). That made adding "Lawyer" or "Professor" a code
-- change and a redeploy, which is the wrong shape for something the business
-- owner should be able to do from /nizam at 11pm.
--
-- So the vocabulary moves into the database. It stays a CLOSED vocabulary —
-- the point of the badge is that every profession on the list has a real,
-- checkable credential behind it — but closing it is now an editorial
-- decision made in the admin panel rather than a deploy.
--
-- ir_professions is publicly readable: it is a display vocabulary (labels,
-- icons, the proof hint shown on the apply form), not member data. Writes are
-- service-role only, same as every other ir_ table.

CREATE TABLE IF NOT EXISTS public.ir_professions (
  -- Stable identifier stored on ir_user_profiles.profession_key and
  -- ir_channels.profession_key. Never edit a key once members hold it —
  -- edit the label instead. Enforced by the FK-less-but-referenced contract
  -- in 015, and by the admin route refusing key edits.
  key         TEXT PRIMARY KEY,

  label       TEXT NOT NULL,
  label_ur    TEXT,
  icon        TEXT NOT NULL DEFAULT '✅',

  -- Cohort channel slug. One profession, one circle.
  slug        TEXT NOT NULL UNIQUE,

  -- Which proof types this profession accepts, most authoritative first.
  -- Validated against the same list the app uses (see DOC_TYPES).
  accepts     TEXT[] NOT NULL DEFAULT ARRAY['other']::TEXT[],
  proof_hint  TEXT,

  -- Retiring a profession hides it from the apply form WITHOUT invalidating
  -- the members who already hold it — their badge keeps rendering. A hard
  -- delete would orphan those profiles, so the admin route never offers one.
  active      BOOLEAN NOT NULL DEFAULT true,

  sort_order  INT     NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The apply form reads active professions in display order on every render.
CREATE INDEX IF NOT EXISTS ir_professions_active_idx
  ON public.ir_professions (sort_order, key)
  WHERE active;

ALTER TABLE public.ir_professions ENABLE ROW LEVEL SECURITY;

-- Public read: this is display vocabulary, and the apply form needs it before
-- a member has signed in. Deliberately different from the deny-all used on
-- member data.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_professions' AND policyname = 'ir_professions_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY ir_professions_public_read ON public.ir_professions FOR SELECT USING (true)';
  END IF;
END $$;

-- No INSERT/UPDATE/DELETE policy: writes go through the service-role admin
-- route only, so a leaked anon key cannot invent a profession.

-- ── Seed: the five launch professions ─────────────────────────
-- Mirrors what src/lib/professions.ts hardcoded, so this migration is a
-- lift-and-shift with no behaviour change on day one. ON CONFLICT DO NOTHING
-- means re-running never clobbers labels an admin has since edited.
INSERT INTO public.ir_professions (key, label, label_ur, icon, slug, accepts, proof_hint, sort_order)
VALUES
  ('doctor', 'Doctor', 'ڈاکٹر', '🩺', 'doctors',
   ARRAY['registration_no','degree_certificate','employment_letter'],
   'NMC/MCI or State Medical Council registration number, or your MBBS/MD degree certificate.', 10),

  ('ca', 'Chartered Accountant', 'چارٹرڈ اکاؤنٹنٹ', '📊', 'chartered-accountants',
   ARRAY['membership_no','degree_certificate'],
   'ICAI membership number (or CFA charter number).', 20),

  ('civil_services', 'Civil Services', 'سول سروسز', '🏛️', 'civil-services',
   ARRAY['employment_letter','registration_no'],
   'UPSC allotment letter, or your service ID / posting order.', 30),

  ('iit_iim', 'IIT / IIM', 'آئی آئی ٹی / آئی آئی ایم', '🎓', 'iit-iim',
   ARRAY['degree_certificate','corporate_email'],
   'Your IIT/IIM degree certificate or alumni email address.', 40),

  ('founder', 'Founder', 'بانی', '🚀', 'founders',
   ARRAY['registration_no','corporate_email','other'],
   'Company CIN/GST number, or your company email address.', 50)
ON CONFLICT (key) DO NOTHING;


-- ── Create a profession and its cohort together ───────────────
-- A profession without a circle is a badge with nowhere to go, and a circle
-- without a profession can never gain members. Creating them separately let
-- an admin produce either half on its own, so this does both in one
-- transaction and is safe to call again for edits.
CREATE OR REPLACE FUNCTION public.ir_upsert_profession(
  p_key        TEXT,
  p_label      TEXT,
  p_icon       TEXT,
  p_slug       TEXT,
  p_accepts    TEXT[],
  p_proof_hint TEXT,
  p_label_ur   TEXT DEFAULT NULL,
  p_sort_order INT  DEFAULT 100,
  p_active     BOOLEAN DEFAULT true
)
RETURNS public.ir_professions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result public.ir_professions;
BEGIN
  INSERT INTO public.ir_professions AS pr
    (key, label, label_ur, icon, slug, accepts, proof_hint, sort_order, active)
  VALUES
    (p_key, p_label, p_label_ur, p_icon, p_slug, p_accepts, p_proof_hint, p_sort_order, p_active)
  ON CONFLICT (key) DO UPDATE SET
    label      = EXCLUDED.label,
    label_ur   = EXCLUDED.label_ur,
    icon       = EXCLUDED.icon,
    slug       = EXCLUDED.slug,
    accepts    = EXCLUDED.accepts,
    proof_hint = EXCLUDED.proof_hint,
    sort_order = EXCLUDED.sort_order,
    active     = EXCLUDED.active,
    updated_at = NOW()
  RETURNING * INTO result;

  -- The matching cohort circle. Keyed on slug (unique on ir_channels), and
  -- the WHERE guard means it only ever touches rows that are ALREADY cohorts
  -- — so this can never convert an existing content channel into one by slug
  -- collision.
  INSERT INTO public.ir_channels (name, slug, description, is_cohort, profession_key)
  VALUES (p_label, p_slug, 'Verified ' || p_label || '.', true, p_key)
  ON CONFLICT (slug) DO UPDATE SET
    name           = EXCLUDED.name,
    profession_key = EXCLUDED.profession_key
  WHERE public.ir_channels.is_cohort;

  -- ...but that guard fails SILENTLY: on a collision with a non-cohort
  -- channel the DO UPDATE is skipped, no error is raised, and we would return
  -- a happily-created profession with no circle attached — a badge with
  -- nowhere to go, discovered only when a member tries to use it.
  -- Verified live during review. Fail the whole transaction instead, so the
  -- admin is told to pick a different slug.
  IF NOT EXISTS (
    SELECT 1 FROM public.ir_channels
    WHERE profession_key = p_key AND is_cohort
  ) THEN
    RAISE EXCEPTION
      'slug "%" is already used by a non-cohort channel; choose another', p_slug
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ir_upsert_profession(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, INT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Done. After running: restart the app so caches reset.
-- ============================================================
