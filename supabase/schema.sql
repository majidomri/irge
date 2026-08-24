-- ─────────────────────────────────────────────────────────────────────────────
-- InstaRishta — Multi-Channel SaaS Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists ir_channels (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        unique not null,
  description text,
  cover_image text,
  created_at  timestamptz not null default now()
);

create table if not exists ir_posts (
  id          uuid        primary key default gen_random_uuid(),
  channel_id  uuid        not null references ir_channels(id) on delete cascade,
  image       text        not null,
  thumb       text,
  title       text,
  caption     text,
  audio_url   text,                        -- Cloudflare R2 public URL
  likes       int         not null default 0,
  views       int         not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists ir_stories (
  id          uuid        primary key default gen_random_uuid(),
  channel_id  uuid        not null references ir_channels(id) on delete cascade,
  image       text        not null,
  created_at  timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists ir_posts_channel_created on ir_posts(channel_id, created_at desc);
create index if not exists ir_stories_channel_created on ir_stories(channel_id, created_at desc);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table ir_channels enable row level security;
alter table ir_posts     enable row level security;
alter table ir_stories   enable row level security;

-- Anyone can read
create policy "ir_channels_public_read" on ir_channels for select using (true);
create policy "ir_posts_public_read"    on ir_posts    for select using (true);
create policy "ir_stories_public_read"  on ir_stories  for select using (true);

-- Only authenticated admins can write
create policy "ir_channels_auth_insert" on ir_channels for insert with check (auth.role() = 'authenticated');
create policy "ir_posts_auth_insert"    on ir_posts    for insert with check (auth.role() = 'authenticated');
create policy "ir_stories_auth_insert"  on ir_stories  for insert with check (auth.role() = 'authenticated');
create policy "ir_posts_auth_delete"    on ir_posts    for delete using (auth.role() = 'authenticated');
create policy "ir_stories_auth_delete"  on ir_stories  for delete using (auth.role() = 'authenticated');

-- ── Atomic counter functions ──────────────────────────────────────────────────

create or replace function ir_increment_likes(post_id uuid)
returns void language sql security definer as $$
  update ir_posts set likes = likes + 1 where id = post_id;
$$;

create or replace function ir_increment_views(post_id uuid)
returns void language sql security definer as $$
  update ir_posts set views = views + 1 where id = post_id;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable realtime on posts so channel-feed.html gets live updates without refresh
alter publication supabase_realtime add table ir_posts;

-- ── Multi-photo carousel ──────────────────────────────────────────────────────
alter table ir_posts add column if not exists images text[] default '{}';

-- ── Site highlights (permanent, manual-advance) ──────────────────────────────
create table if not exists ir_highlights (
  id          uuid        primary key default gen_random_uuid(),
  image       text        not null,
  title       text,
  order_index int         not null default 0,
  created_at  timestamptz not null default now()
);

alter table ir_highlights enable row level security;
create policy "ir_highlights_public_read" on ir_highlights for select using (true);
create policy "ir_highlights_auth_insert" on ir_highlights for insert with check (auth.role() = 'authenticated');
create policy "ir_highlights_auth_delete" on ir_highlights for delete using (auth.role() = 'authenticated');
create policy "ir_highlights_auth_update" on ir_highlights for update using (auth.role() = 'authenticated');

-- ── Auto-delete expired stories ───────────────────────────────────────────────
create or replace function ir_delete_expired_stories(hours_old int default 24)
returns int language sql security definer as $$
  with deleted as (
    delete from ir_stories
    where created_at < now() - (hours_old * interval '1 hour')
    returning id
  )
  select count(*)::int from deleted;
$$;

-- ── Rich biodata, authored in /nizam ─────────────────────────────────────────
-- Keyed by the feed profile id (jsdata.json `id`), which lives outside Postgres,
-- so this is a plain bigint rather than a foreign key. `sections` holds the
-- section model from src/lib/biodata-schema.ts — headings, order and layout are
-- data, so a new section type needs no migration.
create table if not exists ir_biodata (
  profile_id bigint      primary key,
  sections   jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table ir_biodata enable row level security;

-- Read is public (the sheet renders for anonymous visitors). Writes are
-- deliberately given NO policy: /api/admin/biodata uses the service-role key,
-- which bypasses RLS, so authoring stays admin-only rather than open to any
-- authenticated user the way the older tables allow.
create policy "ir_biodata_public_read" on ir_biodata for select using (true);

create index if not exists ir_biodata_updated_idx on ir_biodata (updated_at desc);
