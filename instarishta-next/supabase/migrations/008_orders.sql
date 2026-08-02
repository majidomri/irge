-- ════════════════════════════════════════════════════════════════════════════
-- 008_orders.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Self-hosted UPI checkout. Replaces "user types a UTR into a form → Telegram →
-- admin opens /nizam and hand-activates" with a real order lifecycle:
--
--   created ─claim─> pending_verification ─confirm─> confirmed
--                            │
--                            └──reject / 24h timeout──> rejected  (grant revoked)
--   created ─expiry──────────────────────────────────> expired
--
-- THE CENTRAL IDEA — the unique paise suffix.
--
-- A `upi://pay?pa=…` deep link to our own VPA is fire-and-forget: no PSP sits in
-- the middle, so nothing ever calls us back to say the money landed. We cannot
-- verify in software. What we CAN do is make the money self-identifying: every
-- open order is charged the plan price plus a 1–99 paise suffix nobody else is
-- currently using, so ₹2,199.37 in the PhonePe ledger maps to exactly one order
-- and one user. The UTR is not needed to reconcile — the amount IS the reference.
--
-- Suffix 0 is deliberately never issued. A payment of exactly ₹2,199.00 is
-- therefore known NOT to correspond to any order (a stale screenshot, a repeat
-- of an old amount) rather than ambiguously matching all of them.
--
-- Credits are granted OPTIMISTICALLY on claim, before a human confirms, so the
-- member gets what they paid for in seconds. prev_state holds the snapshot that
-- makes that reversible. Exposure is one member-worth of credits for at most
-- 24h, and it is clawed back automatically.
--
-- ⚠ PRICES BELOW MIRROR src/lib/plans.ts. They are duplicated here because the
--   amount a user is asked to pay must be decided server-side, in the same
--   transaction that reserves the suffix — a client-supplied amount would let
--   anyone buy Rishta 12 for ₹1. Change both together, exactly as 005 requires
--   for `months` / `monthlyCredits`.
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 1. TABLE
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ir_orders (
  -- 16 hex chars / 64 bits, unguessable enough that an order id in a shared
  -- screenshot is not a lead. Derived from gen_random_uuid() rather than
  -- pgcrypto's gen_random_bytes(): the former is core Postgres, the latter needs
  -- an extension that may not be on this project's search_path at DEFAULT
  -- evaluation time.
  id            TEXT        PRIMARY KEY DEFAULT substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16),
  email         TEXT        NOT NULL,
  plan_id       TEXT        NOT NULL,
  amount_paise  INT         NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'created',

  -- Optional, and only ever a human aid: the reconciliation key is amount_paise.
  utr           TEXT,

  -- Profile snapshot taken immediately before the optimistic grant. Restoring it
  -- is what makes a rejection a true no-op.
  prev_state    JSONB,

  granted_at    TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  note          TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '60 minutes',

  CONSTRAINT ir_orders_status_check
    CHECK (status IN ('created','pending_verification','confirmed','rejected','expired')),
  CONSTRAINT ir_orders_plan_check
    CHECK (plan_id IN ('ir6','ir12','topup25')),
  CONSTRAINT ir_orders_amount_check
    CHECK (amount_paise > 0)
);

COMMENT ON TABLE  public.ir_orders             IS 'Self-hosted UPI checkout orders. One row per payment attempt.';
COMMENT ON COLUMN public.ir_orders.amount_paise IS 'Plan price × 100 + a 1-99 paise suffix unique among open orders. The reconciliation key.';
COMMENT ON COLUMN public.ir_orders.prev_state   IS 'ir_user_profiles snapshot taken before the optimistic grant. Used to revoke on rejection.';
COMMENT ON COLUMN public.ir_orders.utr          IS 'Optional, human aid only. Never used to match a payment to an order.';
COMMENT ON COLUMN public.ir_orders.expires_at   IS 'When the reserved amount is released. Past this the order cannot be claimed.';

-- THE uniqueness guarantee. Two open orders for the same plan can never carry
-- the same amount, so a bank credit always resolves to at most one order. A
-- partial index, so settled orders free their suffix for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS ir_orders_open_amount_key
  ON public.ir_orders (plan_id, amount_paise)
  WHERE status IN ('created','pending_verification');

CREATE INDEX IF NOT EXISTS ir_orders_email_idx  ON public.ir_orders (email, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_orders_status_idx ON public.ir_orders (status, created_at DESC);

-- Service-role only, like every other money-touching surface here. No policies
-- are defined, so RLS denies anon and authenticated outright; the API routes
-- reach this table through the service client after checking the session.
ALTER TABLE public.ir_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ir_orders FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 2. ir_order_price — the server-side price book
-- ══════════════════════════════════════════════════════════════
-- Rupees, GST-inclusive, mirroring src/lib/plans.ts. Returns NULL for anything
-- unknown so callers can reject rather than charge zero.

-- search_path is pinned even though this function touches no tables: Supabase's
-- linter flags any unpinned function, and a warning nobody can action is a
-- warning everybody learns to ignore.
CREATE OR REPLACE FUNCTION public.ir_order_price(p_plan TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_plan
           WHEN 'ir6'      THEN 2199
           WHEN 'ir12'     THEN 4499
           WHEN 'topup25'  THEN 349
         END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 3. ir_create_order — reserve an amount for a user
-- ══════════════════════════════════════════════════════════════
-- Returns an existing live order rather than minting a new one when the user
-- reloads the checkout or re-opens the modal: without that, every refresh would
-- burn another suffix and the member would be looking at a different amount
-- than the one they already typed into their UPI app.

CREATE OR REPLACE FUNCTION public.ir_create_order(p_email TEXT, p_plan TEXT)
RETURNS SETOF public.ir_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r       public.ir_orders;
  base    INT;
  suffix  INT;
  taken   INT[];
  free    INT[];
  attempt INT;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'ir_create_order: email is required';
  END IF;

  base := public.ir_order_price(p_plan);
  IF base IS NULL THEN
    RAISE EXCEPTION 'ir_create_order: unknown plan %. Expected ir6, ir12 or topup25.', p_plan;
  END IF;

  -- The profile must exist before we can ever grant against it, and creating it
  -- here means a brand-new member's first action can be a purchase.
  PERFORM public.ir_sync_profile(p_email, NULL);

  -- Reuse a live, unclaimed order for the same plan.
  SELECT * INTO r FROM ir_orders
   WHERE email = p_email AND plan_id = p_plan
     AND status = 'created' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF r.id IS NOT NULL THEN
    RETURN NEXT r;
    RETURN;
  END IF;

  -- Allocate a suffix in 1..99 that no open order for this plan currently holds,
  -- picked at random rather than sequentially: consecutive buyers getting
  -- consecutive amounts would make the next order's amount guessable from a
  -- single receipt.
  --
  -- The retry exists because the partial unique index, not this SELECT, is the
  -- actual guarantee. Two concurrent checkouts can read the same free list and
  -- choose the same number; exactly one INSERT survives and the loser simply
  -- re-reads. Without this the loser would see "could not start checkout" for a
  -- collision that resolves itself on the next attempt.
  FOR attempt IN 1..8 LOOP
    SELECT COALESCE(array_agg(amount_paise - base * 100), '{}'::INT[]) INTO taken
      FROM ir_orders
     WHERE plan_id = p_plan
       AND status IN ('created','pending_verification')
       AND amount_paise BETWEEN base * 100 + 1 AND base * 100 + 99;

    SELECT COALESCE(array_agg(s), '{}'::INT[]) INTO free
      FROM generate_series(1, 99) s
     WHERE s <> ALL (taken);

    IF array_length(free, 1) IS NULL THEN
      RAISE EXCEPTION
        'ir_create_order: all 99 paise suffixes for % are in flight. Orders expire after 60 minutes — retry, or widen the range.', p_plan;
    END IF;

    suffix := free[1 + floor(random() * array_length(free, 1))::INT];

    BEGIN
      INSERT INTO ir_orders (email, plan_id, amount_paise)
      VALUES (p_email, p_plan, base * 100 + suffix)
      RETURNING * INTO r;

      RETURN NEXT r;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      NULL;   -- lost the race for this suffix; loop and pick another
    END;
  END LOOP;

  RAISE EXCEPTION
    'ir_create_order: could not reserve an amount for % after 8 attempts', p_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_create_order(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 4. ir_claim_order — "I've paid": snapshot, then grant optimistically
-- ══════════════════════════════════════════════════════════════
-- Idempotent: a double-tap, a retried fetch, or a back-button replay all return
-- the already-granted order instead of granting twice.

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
    -- bonus_credits, not contact_credits: top-ups are persistent and must
    -- survive the next monthly reset (see 005 §2).
    UPDATE ir_user_profiles
       SET bonus_credits = COALESCE(bonus_credits, 0) + 25, updated_at = now()
     WHERE email = p_email;
  END IF;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_claim_order(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 5. ir_confirm_order — the admin saw the money
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ir_confirm_order(p_id TEXT, p_by TEXT DEFAULT NULL)
RETURNS SETOF public.ir_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ir_orders;
BEGIN
  SELECT * INTO r FROM ir_orders WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'ir_confirm_order: no such order %', p_id;
  END IF;

  IF r.status = 'confirmed' THEN            -- idempotent: two taps, one outcome
    RETURN NEXT r;
    RETURN;
  END IF;

  IF r.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'ir_confirm_order: order % is %, expected pending_verification', p_id, r.status;
  END IF;

  UPDATE ir_orders
     SET status = 'confirmed', resolved_at = now(), resolved_by = p_by
   WHERE id = p_id RETURNING * INTO r;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_confirm_order(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 6. ir_reject_order — no money arrived: take it back
-- ══════════════════════════════════════════════════════════════
-- Restores the snapshot rather than subtracting what was granted. Subtracting
-- would be wrong the moment the member spent any of it — the balance would go
-- negative, or clamp at 0 and silently confiscate credits they already had.
--
-- Slightly generous by construction: a member who held 3 free credits, bought,
-- then spent 5 of the granted 30 is restored to 3, not to 0. Restoring the state
-- they actually paid to leave is the defensible reading, and the amounts are
-- immaterial next to getting a legitimate member's balance wrong.

CREATE OR REPLACE FUNCTION public.ir_reject_order(
  p_id   TEXT,
  p_by   TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS SETOF public.ir_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      public.ir_orders;
  s      JSONB;
  newer  INT;
BEGIN
  SELECT * INTO r FROM ir_orders WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'ir_reject_order: no such order %', p_id;
  END IF;

  IF r.status = 'rejected' THEN
    RETURN NEXT r;
    RETURN;
  END IF;

  IF r.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'ir_reject_order: order % is %, expected pending_verification', p_id, r.status;
  END IF;

  -- If the member bought again after this order was granted, our snapshot is
  -- stale — restoring it would silently destroy the newer, legitimate purchase.
  -- Settle the order but leave the balance alone and say so loudly.
  SELECT count(*) INTO newer
    FROM ir_orders o
   WHERE o.email = r.email
     AND o.id <> r.id
     AND o.granted_at IS NOT NULL
     AND o.granted_at > r.granted_at;

  IF newer > 0 THEN
    UPDATE ir_orders
       SET status      = 'rejected',
           resolved_at = now(),
           resolved_by = p_by,
           note        = COALESCE(p_note || ' — ', '')
                      || 'GRANT NOT REVOKED: ' || newer
                      || ' later order(s) landed for this member. Adjust credits by hand in /nizam.'
     WHERE id = p_id RETURNING * INTO r;
    RETURN NEXT r;
    RETURN;
  END IF;

  s := r.prev_state;

  IF s IS NOT NULL THEN
    UPDATE ir_user_profiles
       SET plan             = COALESCE(s->>'plan', 'none'),
           plan_started_at  = NULLIF(s->>'plan_started_at',  '')::TIMESTAMPTZ,
           plan_expires_at  = NULLIF(s->>'plan_expires_at',  '')::TIMESTAMPTZ,
           monthly_credits  = COALESCE((s->>'monthly_credits')::INT, 0),
           contact_credits  = COALESCE((s->>'contact_credits')::INT, 0),
           bonus_credits    = COALESCE((s->>'bonus_credits')::INT, 0),
           cycle_index      = COALESCE((s->>'cycle_index')::INT, 0),
           credits_reset_at = NULLIF(s->>'credits_reset_at', '')::TIMESTAMPTZ,
           updated_at       = now()
     WHERE email = r.email;
  END IF;

  UPDATE ir_orders
     SET status = 'rejected', resolved_at = now(), resolved_by = p_by, note = p_note
   WHERE id = p_id RETURNING * INTO r;

  RETURN NEXT r;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_reject_order(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 7. ir_sweep_orders — release stale reservations, claw back the unconfirmed
-- ══════════════════════════════════════════════════════════════
-- The other half of optimistic granting. Without this, an unanswered order
-- keeps its credits forever and its paise suffix is never freed.
--
-- p_grace_hours is how long the admin has to confirm before the grant is pulled
-- automatically. 24h by default: long enough to cover a night's sleep, short
-- enough that abuse is not worth the effort.

CREATE OR REPLACE FUNCTION public.ir_sweep_orders(p_grace_hours INT DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      TEXT;
  v_expired INT := 0;
  v_revoked INT := 0;
  v_ids     TEXT[] := '{}';
BEGIN
  -- Never paid for, never claimed → free the amount.
  WITH done AS (
    UPDATE ir_orders
       SET status = 'expired', resolved_at = now(), note = 'Expired unclaimed'
     WHERE status = 'created' AND expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO v_expired FROM done;

  -- Claimed but never confirmed by a human → take the grant back.
  FOR v_id IN
    SELECT id FROM ir_orders
     WHERE status = 'pending_verification'
       AND granted_at < now() - (p_grace_hours || ' hours')::INTERVAL
     ORDER BY granted_at
  LOOP
    PERFORM public.ir_reject_order(
      v_id, 'auto-sweep',
      'Not confirmed within ' || p_grace_hours || 'h of the claim'
    );
    v_revoked := v_revoked + 1;
    v_ids     := v_ids || v_id;
  END LOOP;

  RETURN jsonb_build_object('expired', v_expired, 'revoked', v_revoked, 'revoked_ids', v_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.ir_sweep_orders(INT) FROM PUBLIC, anon, authenticated;

-- Hourly. Same pg_cron caveat as 005 §5 — skipped with a notice if the
-- extension is not enabled, in which case /api/cron/orders must be pinged
-- externally instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ir-sweep-orders')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ir-sweep-orders');
    PERFORM cron.schedule('ir-sweep-orders', '7 * * * *',
                          'SELECT public.ir_sweep_orders();');
  ELSE
    RAISE NOTICE 'pg_cron not installed — hourly order sweep NOT scheduled. Ping /api/cron/orders externally, or unconfirmed grants are never revoked.';
  END IF;
END $$;
