-- Marketing consent, per member, recorded before it is needed.
--
-- ── Why this exists before there is anyone to send to ───────────────────────
-- Promotional RCS to someone who never asked for it is precisely what TRAI's
-- DLT scrubbing exists to stop, and it is the fastest way to lose a freshly
-- approved agent. The expensive version of this mistake is discovering it after
-- onboarding: consent cannot be back-filled, so a database that never captured
-- it has no promotional audience at all, no matter how many members it has.
--
-- Capturing it now means every member who signs up from here on carries the
-- answer, and the audience exists on the day the agent is approved rather than
-- starting from zero then.
--
-- ── The member grants it, not an admin ──────────────────────────────────────
-- There is deliberately no admin control that sets this. A consent flag an
-- operator can tick is not consent, it is a checkbox — and under a regime where
-- the penalty lands on the sender, the only version worth having is the one the
-- member set themselves. /account is where it is granted and withdrawn.
--
-- `rcs_consent_source` records HOW it was obtained, because "they agreed" is
-- not defensible without "here is where and when".

begin;

alter table public.ir_user_profiles
  add column if not exists rcs_consent        boolean     not null default false,
  add column if not exists rcs_consent_at     timestamptz,
  add column if not exists rcs_consent_source text;

comment on column public.ir_user_profiles.rcs_consent is
  'Member opted in to promotional messages. Set only by the member, via /account — never by an admin.';
comment on column public.ir_user_profiles.rcs_consent_source is
  'Where the opt-in was given (e.g. account_settings). Consent without provenance is not defensible.';

-- The audience query is "consented members with a verified phone", so the
-- partial index carries only the rows that can ever be in an audience.
create index if not exists ir_user_profiles_rcs_consent_idx
  on public.ir_user_profiles (rcs_consent, email) where rcs_consent;

commit;
