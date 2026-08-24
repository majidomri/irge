-- ============================================================
-- InstaRishta — Verification approve/reject (idempotent)
-- Run once in Supabase SQL Editor (or via Supabase CLI)
-- Safe to re-run: CREATE OR REPLACE throughout
-- ============================================================
--
-- Approving a verification request touches three tables at once:
--   ir_verification_requests  → status, reviewer, timestamp
--   ir_user_profiles          → profession_key, profession_verified_at
--   ir_channels               → member_count on the matching cohort
--
-- Doing that as three round-trips from the API route would leave the
-- published member count wrong whenever one of them failed midway — and
-- that count is public marketing copy ("412 verified doctors"), so drift is
-- visible to everyone. A single SECURITY DEFINER function keeps all three in
-- one transaction.
--
-- Both functions are re-approval-safe: the UPDATE ... WHERE status='pending'
-- returns no row on a second call, so a double-tapped Approve button is a
-- no-op rather than a double increment.

-- ── Approve ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ir_approve_verification(
  p_request_id UUID,
  p_admin      TEXT
)
RETURNS public.ir_verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req      public.ir_verification_requests;
  old_prof TEXT;
BEGIN
  UPDATE public.ir_verification_requests
  SET status = 'approved', reviewed_by = p_admin, reviewed_at = NOW(), reject_reason = NULL
  WHERE id = p_request_id AND status = 'pending'
  RETURNING * INTO req;

  -- Already reviewed (or no such row): nothing to do, and crucially no
  -- second member_count increment.
  IF req.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Capture the previous profession before overwriting, so a member who
  -- switches cohorts is removed from the old one's count.
  SELECT profession_key INTO old_prof
  FROM public.ir_user_profiles WHERE id = req.user_id;

  UPDATE public.ir_user_profiles
  SET profession_key = req.profession_key,
      profession_verified_at = NOW(),
      updated_at = NOW()
  WHERE id = req.user_id;

  IF old_prof IS DISTINCT FROM req.profession_key THEN
    IF old_prof IS NOT NULL THEN
      UPDATE public.ir_channels
      SET member_count = GREATEST(member_count - 1, 0)
      WHERE is_cohort AND profession_key = old_prof;
    END IF;

    UPDATE public.ir_channels
    SET member_count = member_count + 1
    WHERE is_cohort AND profession_key = req.profession_key;
  END IF;

  RETURN req;
END;
$$;

-- ── Reject ────────────────────────────────────────────────────
-- Rejection is a real outcome, recorded with a reason. It does NOT touch
-- ir_user_profiles: a rejected applicant keeps whatever (if anything) they
-- were verified as before, and never silently gains a badge.
CREATE OR REPLACE FUNCTION public.ir_reject_verification(
  p_request_id UUID,
  p_admin      TEXT,
  p_reason     TEXT
)
RETURNS public.ir_verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.ir_verification_requests;
BEGIN
  UPDATE public.ir_verification_requests
  SET status = 'rejected', reviewed_by = p_admin, reviewed_at = NOW(), reject_reason = p_reason
  WHERE id = p_request_id AND status = 'pending'
  RETURNING * INTO req;

  RETURN req;  -- NULL when already reviewed
END;
$$;

-- ── Reconcile ─────────────────────────────────────────────────
-- Recomputes every cohort's member_count from ir_user_profiles. The
-- incremental path above is correct on its own; this exists as the repair
-- tool for drift from manual SQL edits or restores, and is what the
-- published-count cron will call.
CREATE OR REPLACE FUNCTION public.ir_reconcile_cohort_counts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ir_channels c
  SET member_count = COALESCE(t.n, 0)
  FROM (SELECT profession_key, COUNT(*) AS n
        FROM public.ir_user_profiles
        WHERE profession_key IS NOT NULL AND NOT COALESCE(is_banned, false)
        GROUP BY profession_key) t
  WHERE c.is_cohort AND c.profession_key = t.profession_key;
$$;

-- These are admin/service-role operations only. Revoke from the public
-- roles so a leaked anon key can never self-approve a badge.
REVOKE EXECUTE ON FUNCTION public.ir_approve_verification(UUID, TEXT)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ir_reject_verification(UUID, TEXT, TEXT)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ir_reconcile_cohort_counts()              FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Done. After running: restart the app so caches reset.
-- ============================================================
