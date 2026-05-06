-- ============================================================
-- InstaRishta — Full Schema Migration (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. USER PROFILES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ir_user_profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  full_name        TEXT,
  plan             TEXT DEFAULT 'none'
                   CHECK (plan IN ('none','silver','gold','diamond','platinum')),
  contact_credits  INT  DEFAULT 20,   -- Welcome credits for new users
  plan_expires_at  TIMESTAMPTZ,
  is_banned        BOOLEAN DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ir_user_profiles ENABLE ROW LEVEL SECURITY;

-- Deny-all base policy (service role and SECURITY DEFINER RPCs bypass this)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_profiles' AND policyname = 'deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all ON public.ir_user_profiles USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- Allow authenticated users to read their own profile (for credit balance display)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_profiles' AND policyname = 'users_read_own_profile'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_profile ON public.ir_user_profiles FOR SELECT USING (auth.uid() = id)';
  END IF;
END $$;

-- Ensure existing rows use DEFAULT 20 going forward
ALTER TABLE public.ir_user_profiles
  ALTER COLUMN contact_credits SET DEFAULT 20;

-- Trigger: set 20 credits on first INSERT (covers explicit NULL inserts)
CREATE OR REPLACE FUNCTION public.ir_set_welcome_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.contact_credits IS NULL THEN
    NEW.contact_credits := 20;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ir_welcome_credits_trigger ON public.ir_user_profiles;
CREATE TRIGGER ir_welcome_credits_trigger
  BEFORE INSERT ON public.ir_user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ir_set_welcome_credits();

-- Atomic credit decrement (SECURITY DEFINER bypasses deny_all for UPDATE)
CREATE OR REPLACE FUNCTION public.ir_decrement_credit()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE remaining INT;
BEGIN
  UPDATE public.ir_user_profiles
  SET contact_credits = GREATEST(contact_credits - 1, 0),
      updated_at = NOW()
  WHERE id = auth.uid() AND contact_credits > 0
  RETURNING contact_credits INTO remaining;
  RETURN COALESCE(remaining, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_decrement_credit TO authenticated;


-- ══════════════════════════════════════════════════════════════
-- 2. ROLLING-WINDOW USAGE TABLE (audio plays, profile views)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ir_user_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL CHECK (feature IN ('audio','view')),
  used_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ir_user_usage_user_feature_idx
  ON public.ir_user_usage (user_id, feature, used_at DESC);

ALTER TABLE public.ir_user_usage ENABLE ROW LEVEL SECURITY;

-- Users insert their own usage rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_usage' AND policyname = 'users_insert_own_usage'
  ) THEN
    EXECUTE 'CREATE POLICY users_insert_own_usage ON public.ir_user_usage FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Users count their own usage
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_user_usage' AND policyname = 'users_read_own_usage'
  ) THEN
    EXECUTE 'CREATE POLICY users_read_own_usage ON public.ir_user_usage FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- 3. FEATURED CAROUSEL
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ir_featured (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  link_url    TEXT,
  placement   TEXT DEFAULT 'all'
              CHECK (placement IN ('home','channels','profiles','all')),
  active      BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ir_featured ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ir_featured' AND policyname = 'featured_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY featured_public_read ON public.ir_featured FOR SELECT USING (active = true)';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- 4. POST & STORY — LINK TO USERS
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ir_posts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ir_stories
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ir_posts_user_idx   ON public.ir_posts(user_id);
CREATE INDEX IF NOT EXISTS ir_stories_user_idx ON public.ir_stories(user_id);


-- ══════════════════════════════════════════════════════════════
-- 5. IRIS — DEVICE FINGERPRINT TABLES
-- ══════════════════════════════════════════════════════════════

-- One row per unique device fingerprint
CREATE TABLE IF NOT EXISTS public.ir_fingerprints (
  fp_hash              TEXT PRIMARY KEY,
  canvas_hash          TEXT,
  webgl_hash           TEXT,
  audio_hash           TEXT,
  platform             TEXT,
  language             TEXT,
  timezone             TEXT,
  screen               TEXT,
  hardware_concurrency INT,
  device_memory        REAL,
  touch_points         INT,
  user_agent           TEXT,
  first_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  last_ip              TEXT,
  visit_count          INT DEFAULT 1
);

ALTER TABLE public.ir_fingerprints ENABLE ROW LEVEL SECURITY;
-- All access via SECURITY DEFINER RPCs + /api/iris service role — no direct client access


-- Event log (anon_visit / signup / login / contact_unlock / plan_purchase / referral_click)
CREATE TABLE IF NOT EXISTS public.ir_fp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash    TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  ip_address TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ir_fp_events_fp_idx    ON public.ir_fp_events(fp_hash);
CREATE INDEX IF NOT EXISTS ir_fp_events_user_idx  ON public.ir_fp_events(user_id);
CREATE INDEX IF NOT EXISTS ir_fp_events_event_idx ON public.ir_fp_events(event, created_at DESC);

ALTER TABLE public.ir_fp_events ENABLE ROW LEVEL SECURITY;
-- All access via SECURITY DEFINER RPCs + /api/iris service role — no direct client access


-- ══════════════════════════════════════════════════════════════
-- 6. IRIS — RPCs (all SECURITY DEFINER)
-- ══════════════════════════════════════════════════════════════

-- 6a. Log fingerprint event (legacy RPC path — /api/iris uses service role directly)
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
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
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
        AND  contact_credits > 0
        AND  contact_credits <= 20;
    END IF;
  END IF;

  RETURN jsonb_build_object('suspicious', v_suspicious, 'user_count', v_multi_cnt);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_log_fp TO anon, authenticated;

-- 6b. Check if a fingerprint is linked to any account (anon credit gate)
CREATE OR REPLACE FUNCTION public.ir_fp_has_account(p_fp_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.ir_fp_events
    WHERE  fp_hash = p_fp_hash AND user_id IS NOT NULL
    LIMIT  1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_fp_has_account TO anon, authenticated;

-- 6c. Admin: suspicious fingerprints (one device → multiple accounts)
CREATE OR REPLACE FUNCTION public.ir_admin_suspicious_fps()
RETURNS TABLE (
  fp_hash     TEXT,
  user_count  BIGINT,
  last_seen   TIMESTAMPTZ,
  event_count BIGINT,
  last_ip     TEXT,
  platform    TEXT,
  timezone    TEXT,
  screen      TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.fp_hash,
    COUNT(DISTINCT e.user_id)::BIGINT,
    MAX(e.created_at),
    COUNT(*)::BIGINT,
    f.last_ip,
    f.platform,
    f.timezone,
    f.screen
  FROM public.ir_fp_events e
  LEFT JOIN public.ir_fingerprints f USING (fp_hash)
  WHERE e.user_id IS NOT NULL
  GROUP BY e.fp_hash, f.last_ip, f.platform, f.timezone, f.screen
  HAVING COUNT(DISTINCT e.user_id) > 1
  ORDER BY COUNT(DISTINCT e.user_id) DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_admin_suspicious_fps TO authenticated;

-- 6d. Admin: recent event stream with IP addresses
CREATE OR REPLACE FUNCTION public.ir_admin_fp_events(p_limit INT DEFAULT 200)
RETURNS TABLE (
  id         UUID,
  fp_hash    TEXT,
  user_id    UUID,
  event      TEXT,
  ip_address TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ,
  platform   TEXT,
  timezone   TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.fp_hash, e.user_id, e.event, e.ip_address, e.metadata, e.created_at,
    f.platform, f.timezone
  FROM public.ir_fp_events e
  LEFT JOIN public.ir_fingerprints f USING (fp_hash)
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ir_admin_fp_events TO authenticated;


-- ══════════════════════════════════════════════════════════════
-- Done.
-- After running: restart your app so env vars + client caches reset.
-- ══════════════════════════════════════════════════════════════
