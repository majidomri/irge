-- Consent belongs to a phone number, not to an account.
--
-- ── The gap in 035 ──────────────────────────────────────────────────────────
-- 035 records consent against the member's email. But alerts go to a phone,
-- and the phone is whatever betterauth."user"."phoneNumber" says at send time.
-- A member who opted in on one number and later linked another would have their
-- consent silently carried to the new number — someone who may never have
-- agreed to anything. TRAI's consent is for a number, so ours must be too.
--
-- ── What changes ────────────────────────────────────────────────────────────
-- 1. rcs_consent_phone: the number the member was shown, and agreed for.
-- 2. A trigger on betterauth."user" withdraws consent the moment the linked
--    number changes to anything else. It lives in the database rather than in
--    the phone-link route because the number is written by better-auth's
--    plugin, not by our code — a trigger catches every path that can change it,
--    including ones added later.
--
-- Withdrawing is the safe direction to fail in: the member can turn alerts back
-- on for the new number in one tap, whereas a message sent without consent
-- cannot be unsent.

begin;

alter table public.ir_user_profiles
  add column if not exists rcs_consent_phone text;

comment on column public.ir_user_profiles.rcs_consent_phone is
  'The E.164 number the member opted in for. Consent is void for any other number; see trg ir_rcs_consent_follows_phone.';

-- Backfill consents given before this column existed. Only those whose account
-- has a VERIFIED number get one — that is the number the switch was next to.
-- Anything else is withdrawn: consent with no number attached cannot be
-- shown to have been for the number we would send to.
update public.ir_user_profiles p
   set rcs_consent_phone = u."phoneNumber"
  from betterauth."user" u
 where lower(u.email) = lower(p.email)
   and p.rcs_consent
   and p.rcs_consent_phone is null
   and u."phoneNumber" is not null
   and coalesce(u."phoneNumberVerified", false);

update public.ir_user_profiles
   set rcs_consent = false, rcs_consent_at = null, rcs_consent_source = null
 where rcs_consent and rcs_consent_phone is null;

create or replace function public.ir_rcs_consent_follows_phone()
returns trigger
language plpgsql
security definer
set search_path = public, betterauth
as $$
begin
  if new."phoneNumber" is distinct from old."phoneNumber"
     or coalesce(new."phoneNumberVerified", false) is distinct from coalesce(old."phoneNumberVerified", false) then
    update public.ir_user_profiles
       set rcs_consent        = false,
           rcs_consent_at     = null,
           rcs_consent_source = null,
           rcs_consent_phone  = null
     where lower(email) = lower(new.email)
       and rcs_consent
       and (   rcs_consent_phone is distinct from new."phoneNumber"
            or not coalesce(new."phoneNumberVerified", false));
  end if;
  return new;
end;
$$;

revoke execute on function public.ir_rcs_consent_follows_phone() from public, anon, authenticated;

drop trigger if exists ir_rcs_consent_follows_phone on betterauth."user";
create trigger ir_rcs_consent_follows_phone
  after update of "phoneNumber", "phoneNumberVerified" on betterauth."user"
  for each row execute function public.ir_rcs_consent_follows_phone();

commit;
