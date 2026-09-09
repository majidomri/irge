-- The contacted list moves off the visitor's device.
--
-- ── What this replaces ───────────────────────────────────────────────────────
-- lib/contact-log.ts kept the whole history in localStorage under
-- 'ir_contact_log_v1', capped at 300 entries. That meant:
--
--   * a member who signed in on their phone saw an empty list, because the
--     history lived in the laptop that made it;
--   * clearing site data destroyed it, silently and permanently;
--   * and nothing on the server recorded who had contacted which ad, even
--     though a credit was spent to do it — ir_user_usage stores only
--     feature='contact', with no profile and no number.
--
-- The last one is the reason this is not merely a convenience. The credit
-- spend was already authoritative and server-side; the record of what the
-- credit BOUGHT was not, so there was nothing to answer a member asking why
-- they were charged, and nothing to reconcile a disputed order against.
--
-- ── Written by the server, not the browser ───────────────────────────────────
-- Rows are inserted by POST /api/account/contacts, which takes the email from
-- the better-auth session rather than from the request body, and writes with
-- the service role. There is deliberately no insert policy for `authenticated`:
-- a client that could write here could fabricate a contact history, and this
-- table is meant to be evidence.
--
-- The browser still chooses WHEN to call it — the tap on WhatsApp or Call, the
-- same moment logContact() fired before. What it can no longer choose is whose
-- history the row lands in, or what time it claims to have happened.

begin;

create table if not exists public.ir_contact_log (
  id            uuid primary key default gen_random_uuid(),

  -- Email, not the bridge id, to match ir_interests and ir_user_usage — and
  -- because it survives the phone-to-email account absorb (lib/auth.ts)
  -- without a lookup. Lowercased on write; the policy compares lowercased.
  user_email    text        not null,

  -- The upstream feed id — the identity that is stable across feed edits.
  -- ir_profile_ads.id, but NOT a foreign key: a listing being taken down must
  -- not erase the record that someone paid to contact it.
  profile_id    bigint,

  -- The catalogue position and title AS SHOWN at the time. Denormalised on
  -- purpose: this is a receipt, and a receipt that re-renders itself from
  -- today's catalogue is not a receipt.
  profile_num   integer,
  profile_title text        not null default '',

  kind          text        not null check (kind in ('whatsapp', 'call')),
  number        text        not null,

  -- Mirrors the localStorage flag: the full number is shown exactly once, on
  -- the next load of /contacted, and is masked from then on. Flipped by the
  -- GET described below.
  revealed      boolean     not null default true,

  created_at    timestamptz not null default now()
);

comment on table public.ir_contact_log is
  'One row per contact reveal, written server-side from the session email. Replaces the ir_contact_log_v1 localStorage key.';

-- The only read pattern: one member history, newest first.
create index if not exists ir_contact_log_user_idx
  on public.ir_contact_log (lower(user_email), created_at desc);

alter table public.ir_contact_log enable row level security;

-- Same shape as 031: a blanket deny, then one narrow read for the owner.
-- Without the grant the policies below are dead code.
grant select on public.ir_contact_log to authenticated;

drop policy if exists deny_all on public.ir_contact_log;
create policy deny_all on public.ir_contact_log for all using (false);

drop policy if exists users_read_own_contacts on public.ir_contact_log;
create policy users_read_own_contacts on public.ir_contact_log
  for select using (lower(user_email) = lower((select auth.jwt() ->> 'email')));

-- The reveal-once flag is flipped by GET /api/account/contacts with the
-- service role, in a single UPDATE ... RETURNING scoped to the session email.
--
-- That replaces consumeRevealedNumbers(), which read, mapped and wrote back
-- in three separate steps against localStorage — so two tabs opening
-- /contacted at once could each believe they were the first, and both show a
-- number that was meant to appear exactly once. One statement cannot split
-- that way.

commit;
