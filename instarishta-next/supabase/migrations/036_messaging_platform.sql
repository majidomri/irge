-- The messaging platform: DLT registry, templates, campaigns, log, receipts, opt-outs.
--
-- ── What changed since 034 ──────────────────────────────────────────────────
-- 034 assumed RCS would be sent straight to Google's RBM API. It is not: the
-- DLT entity is registered on SmartPing, and both SMS and RCS go out through an
-- aggregator (Ojiva Nexus, Jio-routed). So the unit of work is no longer "an RBM
-- agent message" but "a DLT-approved template, filled in, sent over a channel".
-- 034's tables stay (they are empty and harmless); nothing new writes to them.
--
-- ── The shape follows the regulator ─────────────────────────────────────────
-- Under TRAI's TCCCPR every commercial SMS must carry the principal entity ID,
-- an approved header, and an approved template ID, and the text must match the
-- approved template with only the {#var#} slots differing. A mismatch is not
-- an error you get back — the operator's scrubbing drops it silently. So the
-- registry here is the source of truth the send path renders FROM, not a note
-- kept beside it.
--
-- ── Secrets are not in here ──────────────────────────────────────────────────
-- API keys and webhook secrets live in environment variables only. Everything
-- in these tables is safe to show an admin on screen.

begin;

-- ── Settings (single row) ───────────────────────────────────────────────────

create table if not exists public.ir_msg_settings (
  id                 smallint primary key default 1 check (id = 1),

  -- 19-digit PE ID from the DLT portal. Not secret; printed on every submission.
  dlt_entity_id      text,

  -- 'test' restricts every send, of every kind, to test_numbers. It is the
  -- default because the carrier approval being held today is a TESTING one.
  mode               text        not null default 'test' check (mode in ('test','live')),
  test_numbers       text[]      not null default '{}',

  sms_enabled        boolean     not null default true,
  rcs_enabled        boolean     not null default true,

  -- TRAI: promotional traffic only between 09:00 and 21:00. Stored so it can be
  -- tightened, but the send path refuses to widen it past the regulatory window.
  promo_window_start smallint    not null default 9  check (promo_window_start between 0 and 23),
  promo_window_end   smallint    not null default 21 check (promo_window_end between 1 and 24),

  -- A ceiling on live messages per IST day, across all campaigns. A runaway
  -- loop or a mistaken audience hits this instead of the whole member base.
  daily_cap          integer     not null default 1000 check (daily_cap >= 0),

  updated_by         text,
  updated_at         timestamptz not null default now()
);

insert into public.ir_msg_settings (id) values (1) on conflict do nothing;

-- ── Senders: DLT headers (SMS) and RCS bots ─────────────────────────────────

create table if not exists public.ir_msg_senders (
  id            uuid primary key default gen_random_uuid(),
  channel       text        not null check (channel in ('sms','rcs')),

  -- SMS: the 6-character header, e.g. INSRTA. RCS: the bot / agent id the
  -- aggregator issued.
  sender_code   text        not null,

  -- DLT's own id for the header registration, when the portal gives one.
  dlt_header_id text,

  -- Headers are registered per category on DLT; a promotional header cannot
  -- carry transactional traffic and vice versa.
  category      text        not null check (category in ('promotional','transactional','service_implicit','service_explicit')),

  status        text        not null default 'approved' check (status in ('pending','approved','rejected','inactive')),
  label         text,
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (channel, sender_code)
);

-- ── Templates ───────────────────────────────────────────────────────────────

create table if not exists public.ir_msg_templates (
  id                   uuid primary key default gen_random_uuid(),
  name                 text        not null,
  channel              text        not null check (channel in ('sms','rcs')),
  category             text        not null check (category in ('promotional','transactional','service_implicit','service_explicit')),
  sender_id            uuid        references public.ir_msg_senders(id) on delete restrict,

  -- The DLT content template id (19 digits). Required for SMS to be sent;
  -- optional for RCS, where the aggregator may key templates its own way.
  dlt_template_id      text,

  -- The id the aggregator's panel assigned, if it has its own template store.
  provider_template_id text,

  -- The approved text, byte for byte, with {#var#} where the variables go.
  body                 text        not null,

  -- One entry per {#var#}, in order: { key, label, sample, max }.
  variables            jsonb       not null default '[]'::jsonb,

  -- Rich RCS content (card / carousel / suggestions), in lib/rcs/messages.ts
  -- RcsPayload shape. Null for plain-text templates.
  rcs_payload          jsonb,

  status               text        not null default 'approved' check (status in ('draft','pending','approved','rejected','paused')),
  notes                text,
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists ir_msg_templates_channel_idx on public.ir_msg_templates (channel, status);

-- ── Campaigns ───────────────────────────────────────────────────────────────

create table if not exists public.ir_msg_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  template_id   uuid        not null references public.ir_msg_templates(id) on delete restrict,

  -- Values for the template's variables that are the same for everyone.
  -- Per-recipient values ({name}) are resolved when the messages are built.
  variables     jsonb       not null default '{}'::jsonb,

  -- { kind: 'consented_members' | 'numbers', numbers?: string[] }
  audience      jsonb       not null,

  -- draft     → built, nothing queued to send
  -- scheduled → will start at scheduled_at
  -- running   → the runner is working through it
  -- paused    → stopped by an admin, resumable
  -- completed → nothing left queued
  -- cancelled → stopped for good; queued rows marked skipped
  -- failed    → stopped by a fatal provider error (auth, rate limit, outage)
  status        text        not null default 'draft'
                check (status in ('draft','scheduled','running','paused','completed','cancelled','failed')),

  scheduled_at  timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  last_error    text,

  total         integer     not null default 0,
  skipped       integer     not null default 0,

  created_by    text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ir_msg_campaigns_status_idx on public.ir_msg_campaigns (status, scheduled_at);

-- ── Messages (outbound log) ─────────────────────────────────────────────────

create table if not exists public.ir_msg_messages (
  -- Our id. Passed to the provider as the client reference where it accepts
  -- one, so a receipt can find its row without a lookup table and a retry can
  -- be recognised as the same message.
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid        references public.ir_msg_campaigns(id) on delete cascade,
  template_id          uuid        references public.ir_msg_templates(id) on delete set null,

  channel              text        not null check (channel in ('sms','rcs')),
  category             text        not null,
  sender_code          text,
  dlt_template_id      text,

  phone                text        not null,
  email                text,

  -- Exactly what was (or would be) sent, after variables were filled in.
  body                 text        not null,
  variables            jsonb       not null default '{}'::jsonb,
  segments             smallint,

  -- queued      → written, not yet handed to the provider
  -- submitted   → provider accepted it
  -- sent        → provider reports handed to the operator
  -- delivered   → handset receipt
  -- read        → RCS read receipt
  -- failed      → provider or operator refused it
  -- unreachable → RCS not available on this number
  -- skipped     → never sent, see skip_reason
  -- dry_run     → rendered and validated only
  status               text        not null default 'queued'
                       check (status in ('queued','submitted','sent','delivered','read','failed','unreachable','skipped','dry_run')),
  skip_reason          text,
  error                text,
  error_code           text,

  provider             text,
  provider_message_id  text,

  -- 'test' or 'live' at the moment of sending, so a test send can never be
  -- mistaken for campaign traffic in the numbers.
  mode                 text        not null default 'test' check (mode in ('test','live')),

  sent_by              text        not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  submitted_at         timestamptz,
  delivered_at         timestamptz,
  read_at              timestamptz,

  -- One message per number per campaign. The business relay number sits on
  -- hundreds of listings; without this, "everyone in the filter" means one
  -- person receiving the same promotion dozens of times.
  unique (campaign_id, phone)
);

create index if not exists ir_msg_messages_created_idx  on public.ir_msg_messages (created_at desc);
create index if not exists ir_msg_messages_campaign_idx on public.ir_msg_messages (campaign_id, status);
create index if not exists ir_msg_messages_phone_idx    on public.ir_msg_messages (phone, created_at desc);
create index if not exists ir_msg_messages_provider_idx on public.ir_msg_messages (provider_message_id) where provider_message_id is not null;

-- ── Events (inbound receipts and replies) ───────────────────────────────────

create table if not exists public.ir_msg_events (
  id                  uuid primary key default gen_random_uuid(),
  provider            text        not null,

  -- Webhooks are at-least-once. The same receipt WILL arrive twice; this key
  -- is what keeps it from counting twice.
  dedupe_key          text        not null unique,

  event_type          text        not null,     -- delivered / failed / read / reply / …
  message_id          uuid,
  provider_message_id text,
  phone               text,
  text                text,
  error               text,
  payload             jsonb       not null,
  created_at          timestamptz not null default now()
);

create index if not exists ir_msg_events_message_idx on public.ir_msg_events (message_id, created_at desc);

-- ── Opt-outs ────────────────────────────────────────────────────────────────
--
-- A number here is never sent promotional or service-explicit traffic again,
-- regardless of what the member's profile says. An admin MAY add one (blocking
-- is always safe); an admin cannot remove the member's own STOP, only one an
-- admin added — enforced in the route, and recorded by `source`.

create table if not exists public.ir_msg_optouts (
  phone       text primary key,
  source      text        not null check (source in ('reply','member','admin','provider')),
  reason      text,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- ── Daily live volume, for the cap ──────────────────────────────────────────

create or replace function public.ir_msg_live_count_today()
returns integer
language sql stable
set search_path = public
as $$
  select count(*)::int
  from public.ir_msg_messages
  where mode = 'live'
    and status not in ('queued','skipped','dry_run')
    and submitted_at >=(date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
$$;

-- ── Campaign progress, computed rather than counted by hand ─────────────────

create or replace function public.ir_msg_campaign_stats(p_campaign uuid)
returns table(status text, n integer)
language sql stable
set search_path = public
as $$
  select m.status, count(*)::int
  from public.ir_msg_messages m
  where m.campaign_id = p_campaign
  group by m.status;
$$;

-- ── updated_at ──────────────────────────────────────────────────────────────

create or replace function public.ir_msg_touch() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['ir_msg_senders','ir_msg_templates','ir_msg_campaigns','ir_msg_messages'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_trg', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ir_msg_touch()', t || '_touch_trg', t);
  end loop;
end $$;

-- ── Access ──────────────────────────────────────────────────────────────────
-- Admin-only, service role only, fail closed — same as 034.

do $$
declare t text;
begin
  foreach t in array array['ir_msg_settings','ir_msg_senders','ir_msg_templates','ir_msg_campaigns','ir_msg_messages','ir_msg_events','ir_msg_optouts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists deny_all on public.%I', t);
    execute format('create policy deny_all on public.%I for all using (false)', t);
  end loop;
end $$;

revoke execute on function public.ir_msg_live_count_today()     from public, anon, authenticated;
revoke execute on function public.ir_msg_campaign_stats(uuid)   from public, anon, authenticated;
grant  execute on function public.ir_msg_live_count_today()     to service_role;
grant  execute on function public.ir_msg_campaign_stats(uuid)   to service_role;

-- The audience RPC was created directly in the database for 035 and never
-- written to a migration file. Recorded here so a fresh environment has it.
create or replace function public.ir_rcs_audience()
returns table(email text, name text, phone text, phone_verified boolean, rcs_consent boolean, consent_at timestamptz, plan text)
language sql
security definer
set search_path = public, betterauth
as $$
  select
    p.email,
    u.name,
    u."phoneNumber",
    coalesce(u."phoneNumberVerified", false),
    coalesce(p.rcs_consent, false),
    p.rcs_consent_at,
    p.plan
  from public.ir_user_profiles p
  left join betterauth."user" u on lower(u.email) = lower(p.email)
  order by coalesce(p.rcs_consent, false) desc, p.email
$$;

revoke execute on function public.ir_rcs_audience() from public, anon, authenticated;
grant  execute on function public.ir_rcs_audience() to service_role;

commit;
