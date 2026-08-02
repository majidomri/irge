-- ════════════════════════════════════════════════════════════════════════════
-- 007_interest_leads.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Turns interests into a two-sided LEAD flow and re-keys them onto the real
-- profile id.
--
-- WHAT CHANGED AND WHY
--
-- 1. profile_id replaces the sha256 profile_key.
--    006 hashed title+body because the app's Profile type (_shared.ts) exposes
--    no identifier — only `_num`, which is array position. That was true of the
--    TYPE but not of the DATA: the upstream feed actually returns a unique,
--    stable `id` per profile (verified: 500/500 unique, none null, range
--    1767–2266). The app was simply discarding it. An integer id is a better
--    key than a content hash — it survives the advertiser editing their text,
--    which a hash does not. profile_key is kept for the existing rows.
--
-- 2. Free-text notes are gone; senders pick a pre-made chip.
--    A free-text box aimed at a stranger's family is a harassment and spam
--    surface that needs moderation forever. A fixed vocabulary removes the
--    entire class of problem, is instantly readable by the team, and works for
--    Urdu-speaking users without transliteration. note stays for the rows that
--    already have one and is no longer written to.
--
-- 3. Lifecycle: new → seen → accepted / declined → connected.
--    'accepted' = the advertiser said they want to connect. Only then may the
--    sender reveal contact details, and THAT is what costs a contact credit.
--    Sending the interest itself stays free.
--
--    NOTE ON WHO GETS NOTIFIED: the feed carries a single phone/whatsapp across
--    every profile (+918886667121 — the business's own number), so there is no
--    per-advertiser contact to notify directly. The lead goes to the team, who
--    relay to the advertiser offline and record the answer in /nizam.
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 1. New columns
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ir_interests
  ADD COLUMN IF NOT EXISTS profile_id     INT,
  ADD COLUMN IF NOT EXISTS chip           TEXT,
  ADD COLUMN IF NOT EXISTS responded_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revealed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revealed_phone TEXT;

COMMENT ON COLUMN public.ir_interests.profile_id IS
  'Upstream feed id — the real profile identity. Preferred over profile_key.';
COMMENT ON COLUMN public.ir_interests.chip IS
  'Key of the pre-made phrase the sender chose. No free text is accepted.';
COMMENT ON COLUMN public.ir_interests.revealed_at IS
  'When the sender spent a contact credit to reveal details. Non-null = already paid; never charge twice.';

-- profile_key was NOT NULL in 006; new rows key on profile_id instead.
ALTER TABLE public.ir_interests ALTER COLUMN profile_key DROP NOT NULL;

-- One interest per profile per sender, now on the real id.
CREATE UNIQUE INDEX IF NOT EXISTS ir_interests_email_profile_idx
  ON public.ir_interests (from_email, profile_id)
  WHERE profile_id IS NOT NULL;

-- Extend the lifecycle.
ALTER TABLE public.ir_interests DROP CONSTRAINT IF EXISTS ir_interests_status_check;
ALTER TABLE public.ir_interests ADD CONSTRAINT ir_interests_status_check
  CHECK (status IN ('new','seen','forwarded','rejected','accepted','declined','connected'));


-- ══════════════════════════════════════════════════════════════
-- 2. ir_send_interest — chips instead of notes, keyed on profile_id
-- ══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.ir_send_interest(TEXT,TEXT,TEXT,TEXT,INT,TEXT,TEXT,TEXT,INT,INT);

CREATE OR REPLACE FUNCTION public.ir_send_interest(
  p_email          TEXT,
  p_user_id        TEXT,
  p_name           TEXT,
  p_profile_id     INT,
  p_profile_num    INT,
  p_profile_title  TEXT,
  p_profile_gender TEXT,
  p_chip           TEXT,
  p_monthly_limit  INT,
  p_daily_limit    INT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, used_month INT, used_day INT, interest_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_month INT;
  v_day   INT;
  v_id    UUID;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'ir_send_interest: email and profile_id are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ir_interest:' || p_email));

  SELECT count(*)::INT INTO v_month FROM ir_user_usage
   WHERE user_id = p_user_id AND feature = 'interest' AND used_at > now() - INTERVAL '30 days';
  SELECT count(*)::INT INTO v_day FROM ir_user_usage
   WHERE user_id = p_user_id AND feature = 'interest' AND used_at > now() - INTERVAL '1 day';

  IF EXISTS (SELECT 1 FROM ir_interests
              WHERE from_email = p_email AND profile_id = p_profile_id) THEN
    RETURN QUERY SELECT FALSE, 'duplicate'::TEXT, v_month, v_day, NULL::UUID;
    RETURN;
  END IF;

  IF v_month >= p_monthly_limit THEN
    RETURN QUERY SELECT FALSE, 'monthly_limit'::TEXT, v_month, v_day, NULL::UUID;
    RETURN;
  END IF;

  IF v_day >= p_daily_limit THEN
    RETURN QUERY SELECT FALSE, 'daily_limit'::TEXT, v_month, v_day, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO ir_interests
    (from_email, from_user_id, from_name, profile_id, profile_num,
     profile_title, profile_gender, chip)
  VALUES
    (p_email, p_user_id, p_name, p_profile_id, p_profile_num,
     p_profile_title, p_profile_gender, p_chip)
  RETURNING id INTO v_id;

  INSERT INTO ir_user_usage (user_id, feature) VALUES (p_user_id, 'interest');

  RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_month + 1, v_day + 1, v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ir_send_interest(TEXT,TEXT,TEXT,INT,INT,TEXT,TEXT,TEXT,INT,INT)
  FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 3. ir_reveal_interest_contact — the credit is spent HERE
-- ══════════════════════════════════════════════════════════════
-- Only allowed once the advertiser has accepted. Spends exactly one contact
-- credit the FIRST time and records revealed_at; every later call returns the
-- same details free of charge, so a refresh or a second device can never
-- double-charge.
--
-- reason ∈ 'ok' | 'already_revealed' | 'not_found' | 'not_accepted' | 'no_credits'

CREATE OR REPLACE FUNCTION public.ir_reveal_interest_contact(
  p_email       TEXT,
  p_interest_id UUID,
  p_phone       TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, phone TEXT, credits_left INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r      ir_interests;
  v_spend RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ir_reveal:' || p_email));

  SELECT * INTO r FROM ir_interests
   WHERE id = p_interest_id AND from_email = p_email
   FOR UPDATE;

  IF r.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  -- Already paid for — hand it back without charging again.
  IF r.revealed_at IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 'already_revealed'::TEXT, r.revealed_phone,
      (SELECT coalesce(contact_credits,0) + coalesce(bonus_credits,0)
         FROM ir_user_profiles WHERE email = p_email);
    RETURN;
  END IF;

  IF r.status NOT IN ('accepted','connected') THEN
    RETURN QUERY SELECT FALSE, 'not_accepted'::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  SELECT * INTO v_spend FROM ir_spend_contact_credit(p_email);
  IF NOT v_spend.allowed THEN
    RETURN QUERY SELECT FALSE, 'no_credits'::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  UPDATE ir_interests
     SET revealed_at    = now(),
         revealed_phone = p_phone,
         status         = 'connected'
   WHERE id = p_interest_id;

  RETURN QUERY SELECT TRUE, 'ok'::TEXT, p_phone,
                      (v_spend.cycle_left + v_spend.bonus_left);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ir_reveal_interest_contact(TEXT,UUID,TEXT)
  FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 4. ir_respond_interest — admin records the advertiser's answer
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ir_respond_interest(p_id UUID, p_status TEXT)
RETURNS SETOF public.ir_interests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r ir_interests;
BEGIN
  IF p_status NOT IN ('new','seen','forwarded','rejected','accepted','declined') THEN
    RAISE EXCEPTION 'ir_respond_interest: invalid status %', p_status;
  END IF;

  UPDATE ir_interests
     SET status       = p_status,
         responded_at = CASE WHEN p_status IN ('accepted','declined') THEN now() ELSE responded_at END
   WHERE id = p_id
     -- 'connected' is terminal: the sender already paid to reveal.
     AND status <> 'connected'
   RETURNING * INTO r;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'ir_respond_interest: no updatable interest %', p_id;
  END IF;

  RETURN NEXT r;
  RETURN;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ir_respond_interest(UUID,TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 5. ir_expiring_plans — feed for the T-14 renewal reminder
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ir_expiring_plans(p_days INT DEFAULT 14)
RETURNS TABLE (email TEXT, full_name TEXT, plan TEXT, plan_expires_at TIMESTAMPTZ, days_left INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT email, full_name, plan, plan_expires_at,
         ceil(EXTRACT(EPOCH FROM (plan_expires_at - now())) / 86400)::INT
    FROM ir_user_profiles
   WHERE plan IN ('ir6','ir12')
     AND plan_expires_at IS NOT NULL
     AND plan_expires_at > now()
     AND plan_expires_at <= now() + (p_days || ' days')::INTERVAL
   ORDER BY plan_expires_at;
$fn$;

REVOKE ALL ON FUNCTION public.ir_expiring_plans(INT) FROM PUBLIC, anon, authenticated;
