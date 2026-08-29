-- ════════════════════════════════════════════════════════════════════════════
-- 023_paid_only_credits.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Three linked changes to how contact credits enter an account.
--
-- §1  WELCOME CREDITS WITHDRAWN (10 → 0)
--     A free signup no longer arrives holding contact unlocks. Contact details
--     are the whole product, and a Google account costs nothing to create — so
--     10 free unlocks per account was 10 unlocks per *throwaway* account, with
--     nothing in the way of repeating it. The free tier keeps everything that
--     is not the product itself: browsing, audio biodata, and 5 interests a
--     month. The wall now lands at the reveal.
--
--     Existing balances are NOT clawed back. Same courtesy 005 §1 extended when
--     the welcome grant went 20 → 10: whatever a member already holds is theirs.
--
-- §2  THE GIFT MOVES FROM SIGNUP TO PURCHASE (+10 on the first term)
--     The 10 credits are not deleted, they are relocated to where they reward a
--     customer instead of funding a scraper. Granted ONCE, on a member's first
--     term activation, as persistent bonus_credits.
--
--     Once, not per activation, because ir_activate_plan is also the admin's
--     manual tool in /nizam: "every activation" would mint 10 credits on every
--     hand-edit and let a member stack bonuses by re-buying early. The
--     welcome_bonus_at column is the guard.
--
-- §3  TOP-UP BECOMES A REFILL, NOT A PLAN (25 → 25 + 5 bonus)
--     There are two plans, Rishta 6 and Rishta 12. The top-up is no longer a
--     third thing to buy from a cold start — it is the refill an ACTIVE
--     subscriber reaches for when their balance hits zero, priced like usage.
--     Buying it grants 25 + a 5-credit bonus, the same "gift on purchase" idea
--     as §2.
--
--     Eligibility (active term AND zero balance) is enforced in the API, not
--     here: see src/lib/topup.ts and POST /api/orders. ir_create_order stays a
--     generic "reserve an amount for this plan id" primitive — it is REVOKEd
--     from anon/authenticated and only ever reached through that one route.
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- §1. WELCOME CREDITS: 10 → 0
-- ══════════════════════════════════════════════════════════════
-- All three grant sites, so no insert path quietly keeps handing out 10:
--   a) the column default,
--   b) the ir_welcome_credits_trigger fallback (001 §, fires on NULL),
--   c) the explicit value in ir_sync_profile.

ALTER TABLE public.ir_user_profiles
  ALTER COLUMN contact_credits SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.ir_set_welcome_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Kept as a NULL-coalescing guard rather than dropped: any hand-written
  -- INSERT that omits the column still lands on a real number, not NULL.
  IF NEW.contact_credits IS NULL THEN
    NEW.contact_credits := 0;
  END IF;
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- §2. PURCHASE BONUS — the guard column
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ir_user_profiles
  ADD COLUMN IF NOT EXISTS welcome_bonus_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ir_user_profiles.welcome_bonus_at IS
  'When the one-time +10 purchase bonus was granted. NULL = never granted. Set by ir_activate_plan; its presence is what makes the bonus once-per-member.';

-- Everyone who has ALREADY paid has had their welcome moment. Without this
-- backfill, every existing subscriber would collect a surprise +10 on their
-- next renewal — a gift aimed at first-time buyers, landing on the base that
-- least needs it.
UPDATE public.ir_user_profiles
   SET welcome_bonus_at = COALESCE(plan_started_at, created_at, now())
 WHERE welcome_bonus_at IS NULL
   AND (plan <> 'none' OR COALESCE(bonus_credits, 0) > 0);


-- ══════════════════════════════════════════════════════════════
-- §1c. ir_sync_profile — new profiles start at 0
-- ══════════════════════════════════════════════════════════════
-- Unchanged from 005 §3 apart from the welcome-credit literal. Reproduced in
-- full because CREATE OR REPLACE needs the whole body; read 005 for why the
-- reset logic is shaped the way it is.

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
  VALUES (p_email, p_full_name, 0, 'none')           -- welcome credits: none (023 §1)
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
-- §2b. ir_activate_plan — grant the one-time welcome bonus
-- ══════════════════════════════════════════════════════════════
-- Unchanged from 005 §4 apart from the bonus block at the end.

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

  -- 023 §2 — the welcome gift, relocated from signup to first purchase.
  -- bonus_credits, not contact_credits: it must survive the monthly reset that
  -- OVERWRITES the cycle balance, and outlive the term itself.
  IF r.welcome_bonus_at IS NULL THEN
    UPDATE ir_user_profiles
       SET bonus_credits    = COALESCE(bonus_credits, 0) + 10,
           welcome_bonus_at = now(),
           updated_at       = now()
     WHERE email = p_email
     RETURNING * INTO r;
  END IF;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_activate_plan(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- §3b. ir_claim_order — a refill now grants 25 + 5
-- ══════════════════════════════════════════════════════════════
-- Unchanged from 008 §4 apart from the topup25 grant (25 → 30).
--
-- KNOWN EDGE: prev_state does not snapshot welcome_bonus_at, so if a first
-- term purchase is later REJECTED, the bonus credits are taken back (they are
-- in the snapshot) but the member stays marked as having had their welcome
-- moment — a genuine re-purchase would not re-grant the +10. It errs toward
-- under-granting and an admin can clear the column; not worth a fourth
-- function rewrite to close.

CREATE OR REPLACE FUNCTION public.ir_claim_order(
  p_id    TEXT,
  p_email TEXT,
  p_utr   TEXT DEFAULT NULL
)
RETURNS SETOF public.ir_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r    public.ir_orders;
  prof public.ir_user_profiles;
BEGIN
  SELECT * INTO r FROM ir_orders WHERE id = p_id FOR UPDATE;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'ir_claim_order: no such order %', p_id;
  END IF;

  -- Ownership is re-checked here and not only in the API route: this function is
  -- the last gate before credits move.
  IF r.email IS DISTINCT FROM p_email THEN
    RAISE EXCEPTION 'ir_claim_order: order % does not belong to %', p_id, p_email;
  END IF;

  IF r.status IN ('pending_verification','confirmed') THEN
    IF p_utr IS NOT NULL AND btrim(p_utr) <> '' AND r.utr IS NULL THEN
      UPDATE ir_orders SET utr = btrim(p_utr) WHERE id = p_id RETURNING * INTO r;
    END IF;
    RETURN NEXT r;
    RETURN;
  END IF;

  IF r.status <> 'created' THEN
    RAISE EXCEPTION 'ir_claim_order: order % is %, cannot be claimed', p_id, r.status;
  END IF;

  -- Deliberately does NOT mark the order expired first: RAISE aborts the
  -- transaction, so that write would be rolled back anyway. ir_sweep_orders()
  -- is what moves lapsed orders to 'expired'.
  IF now() > r.expires_at THEN
    RAISE EXCEPTION 'ir_claim_order: order % expired at %', p_id, r.expires_at;
  END IF;

  -- Snapshot BEFORE granting. Only the fields a grant can move — a whole-row
  -- restore would also roll back unrelated edits made in the meantime.
  SELECT * INTO prof FROM ir_user_profiles WHERE email = p_email FOR UPDATE;
  IF prof.email IS NULL THEN
    RAISE EXCEPTION 'ir_claim_order: no profile for %', p_email;
  END IF;

  UPDATE ir_orders
     SET prev_state = jsonb_build_object(
           'plan',             prof.plan,
           'plan_started_at',  prof.plan_started_at,
           'plan_expires_at',  prof.plan_expires_at,
           'monthly_credits',  prof.monthly_credits,
           'contact_credits',  prof.contact_credits,
           'bonus_credits',    prof.bonus_credits,
           'cycle_index',      prof.cycle_index,
           'credits_reset_at', prof.credits_reset_at
         ),
         status     = 'pending_verification',
         granted_at = now(),
         utr        = NULLIF(btrim(COALESCE(p_utr, '')), '')
   WHERE id = p_id
   RETURNING * INTO r;

  -- Grant.
  IF r.plan_id IN ('ir6','ir12') THEN
    PERFORM public.ir_activate_plan(p_email, r.plan_id);
  ELSIF r.plan_id = 'topup25' THEN
    -- 25 bought + 5 bonus (023 §3). bonus_credits, not contact_credits: refills
    -- are persistent and must survive the next monthly reset (see 005 §2).
    -- NB the 'topup25' id is a frozen wire value — the CHECK constraint in 008
    -- and every existing order row carry it. The number in the NAME is history;
    -- the number granted is here.
    UPDATE ir_user_profiles
       SET bonus_credits = COALESCE(bonus_credits, 0) + 30, updated_at = now()
     WHERE email = p_email;
  END IF;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_claim_order(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
