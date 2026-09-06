-- Moderation: blocking a person, hiding what they published, and keeping the
-- record of both.
--
-- Deliberately additive. Nothing here deletes content: a report that leads to
-- a block is exactly the case where the evidence has to survive, so hiding is
-- a timestamp and the row stays. The one thing that *is* destroyed is the
-- offender's sessions, because "blocked" has to mean logged out now.
--
-- Subjects are (type, id) text pairs rather than foreign keys, matching
-- ir_reports. The same shape has to name a feed listing (an integer id from
-- the profile worker), a member (a betterauth user id, text), and a post or
-- story (a uuid) — three id types that no single column could hold.

-- ── Blocked people ──────────────────────────────────────────────────────────
create table if not exists ir_blocked_users (
  id           uuid primary key default gen_random_uuid(),

  subject_type text not null default 'member'
                 check (subject_type in ('member', 'profile')),
  subject_id   text not null,

  -- Denormalised for the dashboard, so listing blocks does not need a join
  -- against betterauth to show who the row is about.
  email        text,
  display_name text,

  reason       text not null,
  blocked_by   text not null,
  blocked_at   timestamptz not null default now(),

  -- Null means indefinite. Set for a cooling-off period that should lapse.
  expires_at   timestamptz,

  -- Cleared rather than deleted when an admin unblocks, so the history of
  -- "this person was blocked in March and cleared in April" survives.
  unblocked_at timestamptz,
  unblocked_by text,

  unique (subject_type, subject_id)
);

create index if not exists ir_blocked_users_active_idx
  on ir_blocked_users (subject_type, subject_id)
  where unblocked_at is null;

-- ── Hidden content ──────────────────────────────────────────────────────────
-- Hiding is separate from blocking on purpose. A listing can be pulled without
-- blocking its author (a duplicate, a wrong number), and an author can be
-- blocked while their listings stay up pending review.
create table if not exists ir_hidden_listings (
  id           uuid primary key default gen_random_uuid(),

  entity_type  text not null
                 check (entity_type in ('profile', 'member', 'post', 'story')),
  entity_id    text not null,

  reason       text not null,
  hidden_by    text not null,
  hidden_at    timestamptz not null default now(),

  unhidden_at  timestamptz,
  unhidden_by  text,

  unique (entity_type, entity_id)
);

-- The read path asks one question — "what is hidden right now" — on every
-- listing render, so it gets a partial index.
create index if not exists ir_hidden_listings_active_idx
  on ir_hidden_listings (entity_type, entity_id)
  where unhidden_at is null;

-- ── Audit trail ─────────────────────────────────────────────────────────────
-- Who did what, when, and why. Append-only: rows are never updated or removed,
-- including when an action is reversed — the reversal is its own row.
create table if not exists ir_moderation_actions (
  id           bigserial primary key,

  action       text not null
                 check (action in ('block', 'unblock', 'hide', 'unhide', 'revoke-sessions')),

  subject_type text not null,
  subject_id   text not null,

  reason       text,
  actor        text not null,

  -- Whatever the action needs recorded: session count revoked, listings
  -- hidden alongside a block, the report that prompted it.
  detail       jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now()
);

create index if not exists ir_moderation_actions_subject_idx
  on ir_moderation_actions (subject_type, subject_id, created_at desc);

create index if not exists ir_moderation_actions_recent_idx
  on ir_moderation_actions (created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Admin-only, like the firewall tables. No policies, so anon and authenticated
-- read nothing; /api/admin/* reaches them with the service-role key.
alter table ir_blocked_users      enable row level security;
alter table ir_hidden_listings    enable row level security;
alter table ir_moderation_actions enable row level security;
