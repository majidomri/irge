-- ════════════════════════════════════════════════════════════════════════════
-- 003_credits_restore.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Restores the rolling-window usage table that was dropped in commit 775b179
-- ("Remove authentication, IRIS supercookies, and gated features"), rebuilt for
-- the better-auth model.
--
-- WHAT CHANGED vs the original (in 001_full_schema.sql):
--   • user_id is now `text` (a betterauth.user.id), NOT a uuid → auth.users.
--     better-auth users don't live in Supabase's auth.users, so there is no
--     auth.users FK and no auth.uid() to scope RLS by.
--   • Access is SERVER-ONLY via the service-role client, gated by a better-auth
--     session (see src/lib/credits.ts + /api/account/*). RLS is enabled with no
--     anon/authenticated policies, so the table is effectively deny-by-default
--     to the public anon key; the service role bypasses RLS.
--
-- The `contact` credit balance already lives on the existing
-- public.ir_user_profiles.contact_credits column (matched by email) — only the
-- rolling-window audio/view table needed recreating.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ir_user_usage (
  id       uuid primary key default gen_random_uuid(),
  user_id  text        not null,                         -- betterauth.user.id
  feature  text        not null check (feature in ('audio','view')),
  used_at  timestamptz not null default now()
);

create index if not exists ir_user_usage_user_feature_idx
  on public.ir_user_usage (user_id, feature, used_at desc);

-- Deny-by-default to anon/authenticated; service role (server routes) bypasses.
alter table public.ir_user_usage enable row level security;

-- Optional housekeeping: a helper to prune rows older than the rolling window.
-- Called opportunistically by the API; safe to run anytime.
create or replace function public.ir_prune_usage(p_older_than interval default interval '2 hours')
returns void language sql security definer set search_path = public as $$
  delete from public.ir_user_usage where used_at < now() - p_older_than;
$$;
