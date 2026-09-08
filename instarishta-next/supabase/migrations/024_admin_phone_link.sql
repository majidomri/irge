-- ════════════════════════════════════════════════════════════════════════════
-- 024_admin_phone_link.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Let an admin read, set and clear a member's phone number from /nizam.
--
-- ── Why RPCs and not a table write ──────────────────────────────────────────
-- The number lives on betterauth."user", and that schema is private by
-- construction: Supabase only exposes `public` + `graphql_public`, so the
-- service-role PostgREST client the admin routes use cannot see it at all
-- (see 002's header). These two SECURITY DEFINER functions in `public` are the
-- bridge — the same pattern every other admin mutation here already uses.
--
-- ── Why an admin can mark a number verified ─────────────────────────────────
-- The operator sends the code over their own SMS/WhatsApp channel and links it
-- by hand. That is materially cheaper than a Firebase verification per member
-- and uses a channel they already run.
--
-- It IS a bypass: a number set this way unlocks the credit gate
-- (src/lib/phone-gate.ts) without Firebase ever having proved it. That is an
-- accepted trade — admins are trusted — but it is not silent: every set and
-- every clear writes a betterauth.auth_audit row naming the acting admin, so
-- the bypass is always reconstructable after the fact.
--
-- Authorisation is NOT enforced in here. Both functions are REVOKEd from
-- anon/authenticated and are only reachable through PATCH /api/admin/users,
-- which is wrapped in withAdmin (better-auth session + ADMIN_EMAILS allowlist).
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 1. Read: phone numbers for a batch of members
-- ══════════════════════════════════════════════════════════════
-- Batched deliberately. /nizam lists up to 200 users; one call per row would
-- be 200 round trips to render one table.

CREATE OR REPLACE FUNCTION public.ir_admin_phone_map(p_emails TEXT[])
RETURNS TABLE (email TEXT, phone TEXT, verified BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u."email", u."phoneNumber", COALESCE(u."phoneNumberVerified", false)
    FROM betterauth."user" u
   WHERE u."email" = ANY(p_emails);
$$;

REVOKE ALL ON FUNCTION public.ir_admin_phone_map(TEXT[]) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 2. Write: set or clear a member's number
-- ══════════════════════════════════════════════════════════════
-- p_phone NULL or blank clears. Anything else must be E.164 and unclaimed.

CREATE OR REPLACE FUNCTION public.ir_admin_set_phone(
  p_email TEXT,
  p_phone TEXT,
  p_actor TEXT DEFAULT NULL          -- admin email, for the audit trail
)
RETURNS TABLE (email TEXT, phone TEXT, verified BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user   betterauth."user";
  v_clean  TEXT;
  v_holder TEXT;
BEGIN
  SELECT * INTO v_user FROM betterauth."user" u WHERE u."email" = p_email;
  IF v_user."id" IS NULL THEN
    RAISE EXCEPTION 'ir_admin_set_phone: no account for %', p_email;
  END IF;

  v_clean := NULLIF(btrim(COALESCE(p_phone, '')), '');

  -- ── Clear ────────────────────────────────────────────────────────────────
  -- Verified goes false with it. A NULL number that stayed "verified" would
  -- leave the credit gate reading true for a member with no number at all.
  IF v_clean IS NULL THEN
    UPDATE betterauth."user"
       SET "phoneNumber" = NULL, "phoneNumberVerified" = false, "updatedAt" = now()
     WHERE "id" = v_user."id";

    INSERT INTO betterauth."auth_audit" (event, user_id, email, provider)
    VALUES ('admin.phone_cleared', v_user."id", p_email,
            COALESCE('admin:' || p_actor, 'admin'));

    RETURN QUERY SELECT p_email, NULL::TEXT, false;
    RETURN;
  END IF;

  -- ── Set ──────────────────────────────────────────────────────────────────
  IF v_clean !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'ir_admin_set_phone: % is not E.164 (expected +<country><number>)', v_clean;
  END IF;

  -- Named holder in the error: "already in use" without saying by whom sends
  -- the operator hunting through the user list by hand.
  SELECT u."email" INTO v_holder
    FROM betterauth."user" u
   WHERE u."phoneNumber" = v_clean AND u."id" <> v_user."id";
  IF v_holder IS NOT NULL THEN
    RAISE EXCEPTION 'ir_admin_set_phone: % is already linked to %', v_clean, v_holder;
  END IF;

  UPDATE betterauth."user"
     SET "phoneNumber" = v_clean, "phoneNumberVerified" = true, "updatedAt" = now()
   WHERE "id" = v_user."id";

  INSERT INTO betterauth."auth_audit" (event, user_id, email, provider)
  VALUES ('admin.phone_linked', v_user."id", p_email,
          COALESCE('admin:' || p_actor, 'admin'));

  RETURN QUERY SELECT p_email, v_clean, true;
END;
$$;

REVOKE ALL ON FUNCTION public.ir_admin_set_phone(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
