-- Field data for Core Web Vitals.
--
-- /api/vitals has been collecting INP, LCP and CLS from real visitors since
-- the INP work, and writing them to the platform logs. That answered "did the
-- change help" while someone was watching a log tail, and nothing else: there
-- was no way to ask what the p75 was last week, or whether a deploy moved it.
-- Lighthouse measures one machine on one network; this is the other half, and
-- the half that decides whether the work mattered.
--
-- Deliberately small. One row per metric per page-hide, no session, no user,
-- no query string — the same no-PII rule the route already documents.

create table if not exists ir_web_vitals (
  id          bigserial primary key,

  -- 'INP' | 'LCP' | 'CLS'. Not an enum: web-vitals adds metrics, and a new
  -- name should land as data rather than failing an insert.
  name        text        not null,

  -- Milliseconds for INP and LCP. CLS is unitless and fractional, so this is
  -- numeric rather than integer.
  value       numeric     not null,

  -- 'good' | 'needs-improvement' | 'poor', as web-vitals classified it.
  rating      text,

  -- Pathname only. A query string can carry a filter the visitor chose.
  path        text        not null,

  -- INP only: which phase dominated, and what was interacted with. This is
  -- what turns "INP is 300ms" into something actionable.
  target      text,
  load_state  text,

  created_at  timestamptz not null default now()
);

-- The shape every read uses: one metric, recent first. Equality column first,
-- then the sort column, per the composite-index rule.
create index if not exists ir_web_vitals_name_created_idx
  on ir_web_vitals (name, created_at desc);

-- Retention. This table only earns its keep as a trend, and a trend does not
-- need last quarter's raw beacons.
create index if not exists ir_web_vitals_created_idx
  on ir_web_vitals (created_at);

-- Writes come only from the service-role route; nothing reads this from a
-- browser. RLS on with no policy denies both, which is what we want.
alter table ir_web_vitals enable row level security;

comment on table ir_web_vitals is
  'Core Web Vitals field samples from /api/vitals. No PII: pathname only, no session, no user.';
