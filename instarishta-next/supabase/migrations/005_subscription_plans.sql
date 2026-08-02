-- ════════════════════════════════════════════════════════════════════════════
-- 005_subscription_plans.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Replaces the one-time credit packages (silver/gold/diamond/platinum) with two
-- prepaid subscription terms whose contact credits RESET every month:
--
--   ir6   6 months  ₹2,199   30 contact credits / month
--   ir12  12 months ₹4,499   40 contact credits / month
--   free            ₹0       10 contact credits, one time, never resets
--
-- See docs/PRICING_SUBSCRIPTION_PLAN.md for the product rationale.
--
-- ⚠ PART 0 IS A BUG FIX, NOT A FEATURE. Read it before running: profile
--   creation for better-auth users has never worked, and the failure mode is
--   unlimited free contact unlocks. That must be fixed before any plan is sold.
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 0. FOUNDATION FIX — profile rows for better-auth users
-- ══════════════════════════════════════════════════════════════
--
-- ir_user_profiles.id is `UUID PRIMARY KEY REFERENCES auth.users(id)` with no
-- default, dating from when auth lived in Supabase. src/lib/credits.ts inserts
-- {email, full_name, contact_credits, plan} with NO id, so every insert for a
-- better-auth user dies on a not-null violation. credits.ts destructures only
-- `data` and discards `error`, then falls back to a synthetic in-memory profile
-- (id: '', 20 credits) that is never persisted.
--
-- Net effect: for any better-auth user, consume() runs
--   UPDATE ir_user_profiles SET contact_credits = 19 WHERE email = ...
-- which matches ZERO rows, and still returns allowed:true. Contact unlocks are
-- currently free and unlimited for those users. At the time of writing, 3 of 5
-- better-auth users had no profile row.
--
-- Fix: give id a default, drop the auth.users FK (better-auth users are not in
-- auth.users), make email unique so it can serve as the real identity key.

-- 0a. id can now be self-generated.
ALTER TABLE public.ir_user_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 0b. Drop the auth.users FK. Legacy rows keep their ids — this only permits
--     new rows for users who exist solely in betterauth."user".
ALTER TABLE public.ir_user_profiles
  DROP CONSTRAINT IF EXISTS ir_user_profiles_id_fkey;

-- 0c. email is the better-auth ↔ profile bridge; it must be unique for the
--     ON CONFLICT in ir_sync_profile below. Fail loudly rather than silently
--     dropping data if duplicates ever appear.
DO $$
DECLARE dupes INT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(btrim(email)) FROM public.ir_user_profiles
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot add unique index: % duplicate email(s) in ir_user_profiles. Merge them first.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ir_user_profiles_email_key
  ON public.ir_user_profiles (email);

-- 0d. Backfill the better-auth users who were silently denied a profile row.
--     They get 20 credits (the balance the UI has been showing them all along),
--     not the new 10 — we honour what they were promised. New signups get 10.
INSERT INTO public.ir_user_profiles (email, full_name, contact_credits, plan)
SELECT b.email, b.name, 20, 'none'
FROM   betterauth."user" b
WHERE  b.email IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM public.ir_user_profiles p WHERE p.email = b.email)
ON CONFLICT (email) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- 1. FREE TIER: 20 → 10 WELCOME CREDITS
-- ══════════════════════════════════════════════════════════════
-- Existing free users keep whatever balance they hold — no claw-back.
-- Only new signups get 10.

ALTER TABLE public.ir_user_profiles
  ALTER COLUMN contact_credits SET DEFAULT 10;

CREATE OR REPLACE FUNCTION public.ir_set_welcome_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_credits IS NULL THEN
    NEW.contact_credits := 10;
  END IF;
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 2. SUBSCRIPTION COLUMNS
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ir_user_profiles
  ADD COLUMN IF NOT EXISTS plan_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_credits  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cycle_index      INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_credits    INT DEFAULT 0;

COMMENT ON COLUMN public.ir_user_profiles.contact_credits  IS 'Cycle balance — OVERWRITTEN on every monthly reset. Not additive.';
COMMENT ON COLUMN public.ir_user_profiles.bonus_credits    IS 'Purchased top-ups. Persistent: never reset, survives plan expiry. Spent only after contact_credits hits 0.';
COMMENT ON COLUMN public.ir_user_profiles.monthly_credits  IS 'Per-cycle allowance for the active plan (0 free / 30 ir6 / 40 ir12).';
COMMENT ON COLUMN public.ir_user_profiles.plan_started_at  IS 'Reset anchor. Cycle n begins at plan_started_at + n months.';
COMMENT ON COLUMN public.ir_user_profiles.cycle_index      IS 'Cycle number the balance was last funded for. Idempotency guard for ir_sync_profile.';
COMMENT ON COLUMN public.ir_user_profiles.credits_reset_at IS 'Next reset instant. Derived — recomputed on each sync. Display only.';

-- Accept the new plan ids; keep the legacy ones so grandfathered rows stay valid.
ALTER TABLE public.ir_user_profiles
  DROP CONSTRAINT IF EXISTS ir_user_profiles_plan_check;
ALTER TABLE public.ir_user_profiles
  ADD CONSTRAINT ir_user_profiles_plan_check
  CHECK (plan IN ('none','ir6','ir12',
                  'silver','gold','diamond','platinum'));   -- legacy: read-only


-- ══════════════════════════════════════════════════════════════
-- 3. ir_sync_profile — ensure row + expire + monthly reset, atomically
-- ══════════════════════════════════════════════════════════════
-- Replaces the two round-trips in credits.ts ensureProfile() with one call that
-- also applies any due credit reset. Safe to call on every request:
--   • idempotent    — grants only when cycle_index falls behind
--   • collapsing    — 3 missed cycles produce ONE grant, not three
--   • self-healing  — reset day is derived from the anchor each time, so a
--                     31st-of-month subscriber does not drift to the 28th

-- Returns SETOF (yielding exactly one row) rather than a bare composite: it is
-- what makes PostgREST emit a proper single object for .single() in credits.ts.
CREATE OR REPLACE FUNCTION public.ir_sync_profile(
  p_email     TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS SETOF public.ir_user_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.ir_user_profiles;
  n INT;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'ir_sync_profile: email is required';
  END IF;

  INSERT INTO ir_user_profiles (email, full_name, contact_credits, plan)
  VALUES (p_email, p_full_name, 10, 'none')          -- welcome credits: 10
  ON CONFLICT (email) DO NOTHING;

  SELECT * INTO r FROM ir_user_profiles WHERE email = p_email FOR UPDATE;

  -- Backfill a name we didn't have at signup.
  IF r.full_name IS NULL AND p_full_name IS NOT NULL THEN
    UPDATE ir_user_profiles SET full_name = p_full_name, updated_at = now()
     WHERE email = p_email RETURNING * INTO r;
  END IF;

  -- Not on a resetting plan → nothing further to do.
  IF r.plan NOT IN ('ir6','ir12') OR r.plan_started_at IS NULL THEN
    RETURN NEXT r;
    RETURN;
  END IF;

  -- Term over → fall back to free. Purchased top-ups survive.
  IF r.plan_expires_at IS NOT NULL AND now() >= r.plan_expires_at THEN
    UPDATE ir_user_profiles
       SET plan             = 'none',
           monthly_credits  = 0,
           contact_credits  = 0,
           credits_reset_at = NULL,
           cycle_index      = 0,
           updated_at       = now()
     WHERE email = p_email RETURNING * INTO r;
    RETURN NEXT r;
    RETURN;
  END IF;

  -- Whole months elapsed since the anchor.
  n := (EXTRACT(YEAR  FROM age(now(), r.plan_started_at))::INT * 12)
     +  EXTRACT(MONTH FROM age(now(), r.plan_started_at))::INT;

  IF n > COALESCE(r.cycle_index, 0) THEN
    -- One grant regardless of how many cycles were missed. SET, never ADD —
    -- unused credits do not roll over.
    UPDATE ir_user_profiles
       SET contact_credits  = r.monthly_credits,
           cycle_index      = n,
           credits_reset_at = r.plan_started_at + ((n + 1) || ' months')::INTERVAL,
           updated_at       = now()
     WHERE email = p_email RETURNING * INTO r;

  ELSIF r.credits_reset_at IS NULL THEN
    -- Display value missing (e.g. straight after activation) — derive it.
    UPDATE ir_user_profiles
       SET credits_reset_at = r.plan_started_at + ((n + 1) || ' months')::INTERVAL
     WHERE email = p_email RETURNING * INTO r;
  END IF;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_sync_profile(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 3b. ir_spend_contact_credit — atomic unlock, cycle balance first
-- ══════════════════════════════════════════════════════════════
-- Spends the monthly cycle balance before purchased top-ups, so a reset never
-- wipes credits the user paid extra for. Row-locked, so two concurrent unlocks
-- cannot both spend the last credit.
--
-- Callers MUST run ir_sync_profile() first — otherwise a user whose refill is
-- due gets told they are out of credits.

CREATE OR REPLACE FUNCTION public.ir_spend_contact_credit(p_email TEXT)
RETURNS TABLE (allowed BOOLEAN, cycle_left INT, bonus_left INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ir_user_profiles;
BEGIN
  SELECT * INTO r FROM ir_user_profiles WHERE email = p_email FOR UPDATE;

  IF r.email IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0;
    RETURN;
  END IF;

  IF COALESCE(r.contact_credits, 0) > 0 THEN
    UPDATE ir_user_profiles
       SET contact_credits = contact_credits - 1, updated_at = now()
     WHERE email = p_email RETURNING * INTO r;
    RETURN QUERY SELECT TRUE, r.contact_credits, COALESCE(r.bonus_credits, 0);
    RETURN;
  END IF;

  IF COALESCE(r.bonus_credits, 0) > 0 THEN
    UPDATE ir_user_profiles
       SET bonus_credits = bonus_credits - 1, updated_at = now()
     WHERE email = p_email RETURNING * INTO r;
    RETURN QUERY SELECT TRUE, COALESCE(r.contact_credits, 0), r.bonus_credits;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, 0, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_spend_contact_credit(TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 4. ir_activate_plan — admin sells a term
-- ══════════════════════════════════════════════════════════════
-- One atomic call instead of four hand-edited fields in /nizam.
-- Activating mid-term restarts the term from now (an upgrade, not a stack);
-- credit the leftover days as bonus_credits if you want to honour them.

CREATE OR REPLACE FUNCTION public.ir_activate_plan(p_email TEXT, p_plan TEXT)
RETURNS SETOF public.ir_user_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r         public.ir_user_profiles;
  months    INT;
  allowance INT;
BEGIN
  SELECT CASE p_plan WHEN 'ir6' THEN 6  WHEN 'ir12' THEN 12 END,
         CASE p_plan WHEN 'ir6' THEN 30 WHEN 'ir12' THEN 40 END
    INTO months, allowance;

  IF months IS NULL THEN
    RAISE EXCEPTION 'ir_activate_plan: unknown plan %. Expected ir6 or ir12.', p_plan;
  END IF;

  -- Guarantee the row exists before activating.
  PERFORM public.ir_sync_profile(p_email, NULL);

  UPDATE ir_user_profiles
     SET plan             = p_plan,
         plan_started_at  = now(),
         plan_expires_at  = now() + (months || ' months')::INTERVAL,
         monthly_credits  = allowance,
         contact_credits  = allowance,     -- cycle 0 funded immediately
         cycle_index      = 0,
         credits_reset_at = now() + INTERVAL '1 month',
         updated_at       = now()
   WHERE email = p_email
   RETURNING * INTO r;

  IF r.email IS NULL THEN
    RAISE EXCEPTION 'ir_activate_plan: no profile for %', p_email;
  END IF;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_activate_plan(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 5. ir_sweep_plans — batch expire/reset for everyone
-- ══════════════════════════════════════════════════════════════
-- ir_sync_profile is lazy: it only runs when a user shows up. /nizam's list and
-- any renewal-reminder job need fresh state regardless. Both paths are
-- idempotent, so they cannot fight each other.

CREATE OR REPLACE FUNCTION public.ir_sweep_plans()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_count INT := 0;
BEGIN
  FOR v_email IN
    SELECT email FROM ir_user_profiles
    WHERE plan IN ('ir6','ir12') AND email IS NOT NULL
  LOOP
    PERFORM public.ir_sync_profile(v_email, NULL);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_sweep_plans() FROM PUBLIC, anon, authenticated;

-- Nightly at 21:30 UTC = 03:00 IST. Requires pg_cron (available on this project
-- but NOT yet enabled — turn it on under Database → Extensions first). Skipped
-- silently if absent, so this migration runs either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ir-sweep-plans')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ir-sweep-plans');
    PERFORM cron.schedule('ir-sweep-plans', '30 21 * * *',
                          'SELECT public.ir_sweep_plans();');
  ELSE
    RAISE NOTICE 'pg_cron not installed — nightly plan sweep NOT scheduled. Lazy sync still applies resets on user activity.';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- 6. FRAUD SWEEP — stop it wiping paying members
-- ══════════════════════════════════════════════════════════════
-- ir_log_fp zeroed any flagged account holding `contact_credits <= 20`, on the
-- assumption that "≤20 means welcome credits, safe to strip". Once subscribers
-- exist that is false: a Rishta 12 member spent down to 18 sits in that range
-- and would be wiped. Gate on plan, not on the balance.
--
-- (This path fires on auth.uid(), so it is dormant for better-auth users today.
-- Fixing it now means it cannot resurface as a support nightmare later.)

CREATE OR REPLACE FUNCTION public.ir_log_fp(
  p_fp_hash              TEXT,
  p_canvas_hash          TEXT    DEFAULT NULL,
  p_webgl_hash           TEXT    DEFAULT NULL,
  p_audio_hash           TEXT    DEFAULT NULL,
  p_platform             TEXT    DEFAULT NULL,
  p_language             TEXT    DEFAULT NULL,
  p_timezone             TEXT    DEFAULT NULL,
  p_screen               TEXT    DEFAULT NULL,
  p_hardware_concurrency INT     DEFAULT NULL,
  p_device_memory        REAL    DEFAULT NULL,
  p_touch_points         INT     DEFAULT NULL,
  p_user_agent           TEXT    DEFAULT NULL,
  p_event                TEXT    DEFAULT 'page_view',
  p_metadata             JSONB   DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$      -- was mutable: SECURITY DEFINER + anon-callable
DECLARE
  v_uid        UUID    := auth.uid();
  v_multi_cnt  INT     := 0;
  v_suspicious BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.ir_fingerprints
    (fp_hash, canvas_hash, webgl_hash, audio_hash, platform, language, timezone,
     screen, hardware_concurrency, device_memory, touch_points, user_agent, last_seen_at, visit_count)
  VALUES
    (p_fp_hash, p_canvas_hash, p_webgl_hash, p_audio_hash, p_platform, p_language, p_timezone,
     p_screen, p_hardware_concurrency, p_device_memory, p_touch_points, p_user_agent, NOW(), 1)
  ON CONFLICT (fp_hash) DO UPDATE
    SET last_seen_at  = NOW(),
        visit_count   = ir_fingerprints.visit_count + 1,
        user_agent    = COALESCE(p_user_agent,   ir_fingerprints.user_agent),
        canvas_hash   = COALESCE(p_canvas_hash,  ir_fingerprints.canvas_hash),
        webgl_hash    = COALESCE(p_webgl_hash,   ir_fingerprints.webgl_hash),
        audio_hash    = COALESCE(p_audio_hash,   ir_fingerprints.audio_hash);

  INSERT INTO public.ir_fp_events (fp_hash, user_id, event, metadata)
  VALUES (p_fp_hash, v_uid, p_event, p_metadata);

  IF v_uid IS NOT NULL THEN
    SELECT COUNT(DISTINCT user_id) INTO v_multi_cnt
    FROM public.ir_fp_events
    WHERE fp_hash = p_fp_hash AND user_id IS NOT NULL;

    v_suspicious := v_multi_cnt > 1;

    IF v_suspicious THEN
      UPDATE public.ir_user_profiles
      SET    contact_credits = 0, updated_at = NOW()
      WHERE  id = v_uid
        AND  plan = 'none'                        -- never touch a paying member
        AND  COALESCE(bonus_credits, 0) = 0       -- never touch purchased top-ups
        AND  contact_credits > 0;
    END IF;
  END IF;

  RETURN jsonb_build_object('suspicious', v_suspicious, 'user_count', v_multi_cnt);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_log_fp TO anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 7. LEGACY PLAN HOLDERS
-- ══════════════════════════════════════════════════════════════
-- silver/gold/diamond/platinum are grandfathered: plan_expires_at is honoured,
-- balances are untouched, and monthly_credits stays 0 so they get no reset.
-- They are NOT migrated onto ir6/ir12 — at expiry they fall to 'none' like
-- everyone else and see the new pricing.

UPDATE public.ir_user_profiles
   SET monthly_credits = 0, cycle_index = 0, credits_reset_at = NULL
 WHERE plan IN ('silver','gold','diamond','platinum');
