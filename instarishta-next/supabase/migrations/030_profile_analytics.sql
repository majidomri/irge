-- Per-profile analytics: who saw a rishta, from where, and what they did.
--
-- ir_share_events already logs slug, entity_type, event_type, source, ip_hash,
-- and ir_record_event increments the ir_nano_ids counters. That covers the
-- share permalinks and nothing else: it is keyed by nano slug, so a listing
-- browsed on /profiles or read at /l/<id> — which is most of the traffic and
-- all of the answer-engine traffic — was never counted at all. 140 nano ids
-- carry 5 views and 4 shares between them, which is the size of the blind spot.
--
-- This table is keyed by the profile itself, records the interaction types the
-- feed actually has, and stores a classified traffic source rather than a raw
-- hostname. ir_share_events stays as it is; nothing is migrated off it.
--
-- No PII. A visitor is a salted hash, never an address; there is no user_id,
-- because knowing which member looked at which rishta is surveillance rather
-- than analytics, and nothing in /nizam needs it.

create table if not exists ir_profile_events (
  id          bigserial   primary key,

  -- What was interacted with. 'profile' is a feed listing (ir id), 'biodata'
  -- is an authored bio, 'post' is a channel post.
  entity_type text        not null,
  entity_id   text        not null,

  -- view       the listing's own page was opened
  -- impression the card scrolled into the viewport on /profiles
  -- click      the card was opened from the feed
  -- share      a share sheet or copy-link fired
  -- listen     a voice note was played
  -- contact    the contact reveal was used
  event       text        not null,

  -- Classified once on write (lib/traffic-source), raw host kept beside it so
  -- a mapping that turns out wrong can be recomputed instead of lost.
  source        text      not null default 'direct',
  source_detail text,

  -- Coarse, and deliberately so: enough to answer "is this listing travelling
  -- outside Hyderabad" without following anybody around.
  country     text,
  device      text,

  -- Salted hash of address + entity. Lets a repeat view be distinguished from
  -- a fresh one without storing who anybody is.
  visitor_hash text,

  created_at  timestamptz not null default now()
);

-- The shape every read uses: one entity, recent first.
create index if not exists ir_profile_events_entity_idx
  on ir_profile_events (entity_type, entity_id, created_at desc);

-- The rollup: counts per event per source over a window.
create index if not exists ir_profile_events_rollup_idx
  on ir_profile_events (created_at desc, event, source);

-- Deduplicating repeat impressions within a window.
create index if not exists ir_profile_events_visitor_idx
  on ir_profile_events (visitor_hash, entity_id, event);

-- Service-role only: written by /api/track, read by /api/admin/*. RLS on with
-- no policy denies the anon key both, which is what we want — this is the one
-- table where a client-side read would leak the whole audience of every
-- listing to anyone with the publishable key.
alter table ir_profile_events enable row level security;

comment on table ir_profile_events is
  'Per-profile analytics. No PII: salted visitor hash, coarse country/device, no user id.';

-- Live updates in /nizam. The publication already carries ir_posts and
-- ir_user_profiles; adding this one lets the admin dashboard subscribe to
-- inserts instead of polling. Guarded because re-running a migration that
-- re-adds a published table raises.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ir_profile_events'
  ) then
    alter publication supabase_realtime add table public.ir_profile_events;
  end if;
end $$;
