-- RCS for Business: the outbound log, the inbound events, and a capability cache.
--
-- ── Why a log, and not just fire-and-forget ──────────────────────────────────
-- RCS has no unsend. Once a message reaches a handset it is on someone's phone
-- next to their family's messages, and the only thing that makes that safe to
-- operate is knowing exactly what was sent, to whom, by which admin, and
-- whether it landed. This table is that record, and it is written BEFORE the
-- API call rather than after — a row with status 'queued' and no delivery
-- receipt is a message that may have gone out, which is the honest state to be
-- in after a timeout. Writing after the call would lose exactly the sends you
-- most need to know about.
--
-- ── Idempotency lives here ──────────────────────────────────────────────────
-- The RBM API takes a caller-supplied messageId and treats a repeat as a no-op.
-- That only helps if the id is stable across retries, so it is generated once,
-- persisted here as the primary key, and reused. A retry that reuses the row's
-- id cannot double-send; a retry that mints a fresh one can.

begin;

-- ── Outbound ─────────────────────────────────────────────────────────────────

create table if not exists public.ir_rcs_messages (
  -- OUR id, sent to Google as ?messageId=. Not Google's — that is the whole
  -- point: we choose it so a retry is idempotent.
  id            uuid primary key default gen_random_uuid(),

  -- E.164. Not a foreign key to anything: we message advertisers whose numbers
  -- came off a listing, and members, and neither is a stable owner of a number.
  phone         text        not null,

  -- Which listing this was about, when it was about one. Kept for the audit
  -- trail rather than for joining — see ir_contact_log for the same reasoning.
  profile_id    bigint,

  -- The rendered request, exactly as it went to the API. Stored whole because
  -- a log that records "a carousel was sent" cannot answer "what did it say",
  -- and that is the question anyone ever actually asks.
  payload       jsonb       not null,

  -- What the message was FOR. Carriers bill and filter on this, and calling a
  -- promotion a transaction is the fastest way to lose an agent's launch
  -- approval — so it is a stored, constrained fact, not a UI detail.
  traffic_type  text        not null default 'TRANSACTION'
                check (traffic_type in ('AUTHENTICATION','TRANSACTION','PROMOTION','SERVICEREQUEST','ACKNOWLEDGEMENT')),

  -- queued      → row written, API not yet called (or call in flight)
  -- sent        → API accepted it
  -- delivered   → handset confirmed, via webhook
  -- read        → user opened it, via webhook
  -- unreachable → 404: no RCS, or our agent is not live on their carrier
  -- failed      → anything else
  -- dry_run     → rendered and validated, deliberately not dispatched
  status        text        not null default 'queued'
                check (status in ('queued','sent','delivered','read','unreachable','failed','dry_run')),

  error         text,

  -- Which admin sent it. An unattributed outbound message is not auditable.
  sent_by       text        not null,

  -- Groups one "send to these 40 people" action, so the UI can show a campaign
  -- rather than 40 unrelated rows.
  batch_id      uuid,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  read_at       timestamptz
);

comment on table public.ir_rcs_messages is
  'Outbound RCS log. Written before the API call so a timed-out send is still recorded. id IS the messageId sent to Google, which is what makes retries idempotent.';

create index if not exists ir_rcs_messages_batch_idx   on public.ir_rcs_messages (batch_id, created_at desc);
create index if not exists ir_rcs_messages_created_idx on public.ir_rcs_messages (created_at desc);
create index if not exists ir_rcs_messages_phone_idx   on public.ir_rcs_messages (phone, created_at desc);

-- ── Inbound ──────────────────────────────────────────────────────────────────

create table if not exists public.ir_rcs_events (
  id           uuid primary key default gen_random_uuid(),

  -- Google's own event id. UNIQUE because webhooks are at-least-once: the same
  -- delivery receipt WILL arrive twice, and without this the log slowly fills
  -- with duplicates that make delivery counts wrong.
  event_id     text        unique,

  event_type   text,
  phone        text,

  -- Links a receipt back to the outbound row. Not a foreign key: an inbound
  -- reply has no outbound row, and a receipt must still be recorded even if it
  -- somehow arrives for a message we have no record of.
  message_id   uuid,

  -- What the user typed, or the postbackData of the suggestion they tapped.
  text         text,
  postback     text,

  payload      jsonb       not null,
  created_at   timestamptz not null default now()
);

comment on table public.ir_rcs_events is
  'Inbound RCS events: delivery/read receipts, user replies, suggestion taps. event_id is unique because webhook delivery is at-least-once.';

create index if not exists ir_rcs_events_message_idx on public.ir_rcs_events (message_id, created_at desc);
create index if not exists ir_rcs_events_phone_idx   on public.ir_rcs_events (phone, created_at desc);

-- ── Capability cache ─────────────────────────────────────────────────────────

create table if not exists public.ir_rcs_capability (
  phone       text primary key,
  reachable   boolean     not null,
  features    text[]      not null default '{}',
  checked_at  timestamptz not null default now()
);

comment on table public.ir_rcs_capability is
  'Per-number RCS reachability. Cached because the single-number capability check is one HTTP round trip each and users:batchGet refuses anything under 500 numbers.';

-- ── Access ───────────────────────────────────────────────────────────────────
--
-- All three are admin-only and are read and written exclusively with the
-- service role. RLS on with a blanket deny and no grant to `authenticated`:
-- there is no member-facing view of any of this, and an outbound messaging log
-- is exactly the kind of table where "no policy yet" should fail closed rather
-- than wait for someone to remember.

alter table public.ir_rcs_messages   enable row level security;
alter table public.ir_rcs_events     enable row level security;
alter table public.ir_rcs_capability enable row level security;

drop policy if exists deny_all on public.ir_rcs_messages;
create policy deny_all on public.ir_rcs_messages for all using (false);

drop policy if exists deny_all on public.ir_rcs_events;
create policy deny_all on public.ir_rcs_events for all using (false);

drop policy if exists deny_all on public.ir_rcs_capability;
create policy deny_all on public.ir_rcs_capability for all using (false);

create or replace function public.ir_rcs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ir_rcs_messages_touch_trg on public.ir_rcs_messages;
create trigger ir_rcs_messages_touch_trg before update on public.ir_rcs_messages
  for each row execute function public.ir_rcs_touch();

commit;
