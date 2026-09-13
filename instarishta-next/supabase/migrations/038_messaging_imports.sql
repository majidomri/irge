-- Importing the gateway's own reports, and the fields they carry.
--
-- Until the Ojiva API is wired, sends happen in the Nexus panel and the truth
-- about them lives in the CSVs Nexus exports. Importing those turns the log
-- here into the single record of what went out — including sends made before
-- this platform existed — and lets a campaign exported from here be
-- reconciled with its delivery report afterwards.
--
-- Observed in the first exports (2026-09-12/13): a delivery report carries a
-- message id, sent/delivered times, an error code (000 delivered; 321 on a
-- message sent with its {#…#} placeholders unfilled; 350 on one handset),
-- a gateway number and a per-message cost (₹0.14).

begin;

alter table public.ir_msg_messages
  add column if not exists source            text not null default 'platform' check (source in ('platform','import')),
  add column if not exists external_campaign text,
  add column if not exists sent_at           timestamptz,
  add column if not exists gateway           text,
  add column if not exists cost              numeric(10,4);

comment on column public.ir_msg_messages.source is
  'platform = sent from /nizam; import = loaded from a gateway report (e.g. a Nexus CSV).';

create index if not exists ir_msg_messages_external_idx
  on public.ir_msg_messages (external_campaign, phone) where external_campaign is not null;

alter table public.ir_msg_settings
  add column if not exists provider_balance    numeric(14,2),
  add column if not exists provider_rate       numeric(10,4),
  add column if not exists provider_summary    jsonb,
  add column if not exists provider_summary_at timestamptz;

create table if not exists public.ir_msg_imports (
  id           uuid primary key default gen_random_uuid(),
  kind         text        not null,   -- delivery_report | campaign_report | account_summary
  filename     text,
  rows         integer     not null default 0,
  inserted     integer     not null default 0,
  updated      integer     not null default 0,
  skipped      integer     not null default 0,
  notes        jsonb       not null default '[]'::jsonb,
  imported_by  text        not null,
  created_at   timestamptz not null default now()
);

alter table public.ir_msg_imports enable row level security;
drop policy if exists deny_all on public.ir_msg_imports;
create policy deny_all on public.ir_msg_imports for all using (false);

commit;
