-- Edge firewall: an admin-managed IP denylist, and a record of what the
-- firewall actually did.
--
-- The denylist used to be the BLOCKED_IPS environment variable, which meant a
-- redeploy to block an abuser and no way for anyone but a deployer to do it.
-- It lives here so /nizam can manage it.

-- ── Denylist ────────────────────────────────────────────────────────────────
create table if not exists ir_blocked_ips (
  id          uuid primary key default gen_random_uuid(),

  -- Either an exact address ("203.0.113.7") or a prefix ending in a dot
  -- ("203.0.113."), which blocks that range without CIDR arithmetic in the
  -- edge runtime. Unique so the same address cannot be listed twice.
  pattern     text not null unique,

  -- Free text from the admin who added it. Worth requiring in the UI: a
  -- denylist nobody can explain becomes one nobody dares prune.
  reason      text,

  created_by  text,
  created_at  timestamptz not null default now(),

  -- Null means indefinite. A temporary block should carry an expiry so it
  -- lapses on its own rather than accumulating forever.
  expires_at  timestamptz
);

-- The middleware reads the whole active list, so this is the index that matters.
create index if not exists ir_blocked_ips_active_idx
  on ir_blocked_ips (expires_at nulls first);

-- ── What the firewall did ───────────────────────────────────────────────────
-- Only blocks and rate-limit trips are recorded. Logging every request would
-- be a write per page view for data nobody reads.
create table if not exists ir_security_events (
  id          bigserial primary key,

  -- 'blocked' (a firewall rule matched), 'rate-limited', or 'denied' (the
  -- address was on the list above).
  kind        text not null,

  -- Which rule: 'bad-uri', 'bad-ua', 'auth', and so on.
  reason      text not null,

  ip          text,
  country     text,
  region      text,
  city        text,
  device      text,
  method      text,
  path        text,
  user_agent  text,

  created_at  timestamptz not null default now()
);

create index if not exists ir_security_events_recent_idx
  on ir_security_events (created_at desc);

create index if not exists ir_security_events_ip_idx
  on ir_security_events (ip, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Both tables are admin-only. No policies are created, so with RLS enabled
-- the anon and authenticated roles can read nothing; the service-role key
-- used by /api/admin/* bypasses RLS as it does for every other admin table.
alter table ir_blocked_ips     enable row level security;
alter table ir_security_events enable row level security;
