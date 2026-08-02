-- ════════════════════════════════════════════════════════════════════════════
-- 006_interests.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 of the subscription work: "Interests" — a metered, PRIVATE way to
-- tell a family you are interested, without spending a contact credit.
--
-- Design notes that matter:
--
-- 1. PRIVATE, NOT A COMMENT THREAD. The original idea was a public comments
--    section under channel posts. These are real, identifiable people —
--    frequently women, usually posted by their families — so a public thread
--    under a biodata is a harassment vector and an IT Rules 2021 intermediary
--    liability. An interest is a one-tap private signal to the admin/family.
--
-- 2. ROLLING WINDOW, NOT A RESET BALANCE. Contact credits use the cycle/reset
--    machinery in 005 because they are the money unit. Interests instead use a
--    rolling 30-day count over ir_user_usage — the same mechanism already
--    proven for audio plays. No new anchor columns, no reset bookkeeping, and
--    no month-boundary cliff. Allowance is derived from the user's plan at
--    call time and passed in by the caller (src/lib/plans.ts stays the single
--    source of truth for numbers).
--
-- 3. IDENTITY IS A CONTENT HASH, NOT A ROW ID. Profiles on /profiles do NOT
--    live in this database — they are fetched from an external Cloudflare
--    Worker feed (src/lib/data.ts getProfiles), and their only handle is
--    `_num`, which _shared.ts derives from ARRAY POSITION at render time. One
--    insertion at the top of the feed would silently re-point every stored
--    interest at a different family. So we key on sha256(title + body) and
--    snapshot the title/gender/number into the row, making each record
--    self-describing even if the feed shifts underneath it.
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 1. 'interest' joins the rolling-usage features
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ir_user_usage
  DROP CONSTRAINT IF EXISTS ir_user_usage_feature_check;
ALTER TABLE public.ir_user_usage
  ADD CONSTRAINT ir_user_usage_feature_check
  CHECK (feature IN ('audio','view','interest'));


-- ══════════════════════════════════════════════════════════════
-- 2. ir_interests
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ir_interests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email     TEXT        NOT NULL,
  from_user_id   TEXT        NOT NULL,          -- betterauth."user".id
  from_name      TEXT,
  profile_key    TEXT        NOT NULL,          -- sha256(normalised title + body)
  profile_num    INT,                           -- position at send time; DISPLAY ONLY, drifts
  profile_title  TEXT,
  profile_gender TEXT,
  note           TEXT        CHECK (note IS NULL OR char_length(note) <= 300),
  status         TEXT        NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new','seen','forwarded','rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_email, profile_key)              -- one interest per profile per user
);

COMMENT ON COLUMN public.ir_interests.profile_key IS
  'sha256 of the normalised profile text. Profiles live in an external feed with no stable id — array position (_num) is NOT safe to key on.';
COMMENT ON COLUMN public.ir_interests.profile_num IS
  'Feed position when sent. Display convenience only — may point at a different profile later.';

CREATE INDEX IF NOT EXISTS ir_interests_status_idx  ON public.ir_interests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_interests_email_idx   ON public.ir_interests (from_email, created_at DESC);

-- Server-only, exactly like ir_user_usage: service role bypasses, nobody else
-- gets a policy. Interests contain who-likes-whom — never client-readable.
ALTER TABLE public.ir_interests ENABLE ROW LEVEL SECURITY;

-- Rolling-window counting needs this; ir_user_usage only had a composite index
-- starting with user_id, which already serves us, but interest lookups also run
-- by feature alone for admin stats.
CREATE INDEX IF NOT EXISTS ir_user_usage_feature_time_idx
  ON public.ir_user_usage (feature, used_at DESC);


-- ══════════════════════════════════════════════════════════════
-- 3. ir_send_interest — quota check + record, atomically
-- ══════════════════════════════════════════════════════════════
-- Limits are passed in rather than hardcoded so src/lib/plans.ts remains the
-- single source of truth. An advisory lock keyed on the sender serialises
-- concurrent sends, so two tabs cannot both slip past the last slot.
--
-- reason ∈ 'ok' | 'duplicate' | 'monthly_limit' | 'daily_limit'

CREATE OR REPLACE FUNCTION public.ir_send_interest(
  p_email          TEXT,
  p_user_id        TEXT,
  p_name           TEXT,
  p_profile_key    TEXT,
  p_profile_num    INT,
  p_profile_title  TEXT,
  p_profile_gender TEXT,
  p_note           TEXT,
  p_monthly_limit  INT,
  p_daily_limit    INT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, used_month INT, used_day INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_month INT;
  v_day   INT;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' OR p_profile_key IS NULL OR btrim(p_profile_key) = '' THEN
    RAISE EXCEPTION 'ir_send_interest: email and profile_key are required';
  END IF;

  -- Serialise this sender for the rest of the transaction.
  PERFORM pg_advisory_xact_lock(hashtext('ir_interest:' || p_email));

  SELECT count(*)::INT INTO v_month FROM ir_user_usage
   WHERE user_id = p_user_id AND feature = 'interest' AND used_at > now() - INTERVAL '30 days';
  SELECT count(*)::INT INTO v_day FROM ir_user_usage
   WHERE user_id = p_user_id AND feature = 'interest' AND used_at > now() - INTERVAL '1 day';

  IF EXISTS (SELECT 1 FROM ir_interests
              WHERE from_email = p_email AND profile_key = p_profile_key) THEN
    RETURN QUERY SELECT FALSE, 'duplicate'::TEXT, v_month, v_day;
    RETURN;
  END IF;

  IF v_month >= p_monthly_limit THEN
    RETURN QUERY SELECT FALSE, 'monthly_limit'::TEXT, v_month, v_day;
    RETURN;
  END IF;

  IF v_day >= p_daily_limit THEN
    RETURN QUERY SELECT FALSE, 'daily_limit'::TEXT, v_month, v_day;
    RETURN;
  END IF;

  INSERT INTO ir_interests
    (from_email, from_user_id, from_name, profile_key, profile_num, profile_title, profile_gender, note)
  VALUES
    (p_email, p_user_id, p_name, p_profile_key, p_profile_num, p_profile_title, p_profile_gender,
     NULLIF(btrim(coalesce(p_note, '')), ''));

  INSERT INTO ir_user_usage (user_id, feature) VALUES (p_user_id, 'interest');

  RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_month + 1, v_day + 1;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ir_send_interest(TEXT,TEXT,TEXT,TEXT,INT,TEXT,TEXT,TEXT,INT,INT)
  FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 4. ir_interest_usage — current rolling counts for one sender
-- ══════════════════════════════════════════════════════════════
-- Lets the UI show "12 of 40 interests used this month" without a second query.

CREATE OR REPLACE FUNCTION public.ir_interest_usage(p_user_id TEXT)
RETURNS TABLE (used_month INT, used_day INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT
    (SELECT count(*)::INT FROM ir_user_usage
      WHERE user_id = p_user_id AND feature = 'interest' AND used_at > now() - INTERVAL '30 days'),
    (SELECT count(*)::INT FROM ir_user_usage
      WHERE user_id = p_user_id AND feature = 'interest' AND used_at > now() - INTERVAL '1 day');
$fn$;

REVOKE ALL ON FUNCTION public.ir_interest_usage(TEXT) FROM PUBLIC, anon, authenticated;
