-- 031 — listing ownership, and letting a member read their own rows
--
-- ## Why this exists
--
-- Until now nothing linked a listing to an account. The profile catalogue is
-- an external read-only feed (see PROFILE_WORKER_BASE in src/lib/data.ts)
-- whose records carry id/title/phone/whatsapp/age/body/gender/priority/date/
-- education and no account reference of any kind. So "how many people viewed
-- my profile" was not a number the platform could answer, and the analytics we
-- collect in ir_profile_events — which are keyed by the feed's numeric id —
-- had no owner to show them to.
--
-- ir_profile_claims supplies that missing edge: a member asserts that a listing
-- is theirs, and once the claim is approved the events for that listing become
-- theirs to see.
--
-- ## The proof
--
-- Every feed record carries the advertiser's `phone` and `whatsapp`. A member
-- who has verified that same number through the Firebase phone flow has
-- demonstrated control of the contact point the ad itself publishes, which is
-- the strongest evidence available without contacting the family. That case is
-- auto-approved by the API. Everything else queues for a human in /nizam.
--
-- ## The two unique indexes are the actual safety
--
-- A listing can have exactly one approved owner, and a member cannot file the
-- same claim twice. Without the first, two people could each be shown "your"
-- audience for one ad, and both would be told something private about a
-- stranger.

create table if not exists ir_profile_claims (
  id             uuid primary key default gen_random_uuid(),
  -- The feed's own numeric id. Text in ir_profile_events.entity_id, bigint
  -- here, because bigint is what the feed actually publishes.
  profile_num    bigint      not null,
  user_id        uuid        not null references ir_user_profiles(id) on delete cascade,
  email          text        not null,
  status         text        not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'revoked')),
  -- 'phone_match' when the member's verified number equals the ad's, else
  -- 'manual'. Recorded so an audit can tell an automatic approval from a human
  -- one without joining to the moderation log.
  proof          text,
  claimed_phone  text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  reason         text,
  created_at     timestamptz not null default now()
);

-- One approved owner per listing. Partial, so rejected and revoked claims for
-- the same listing can coexist as history.
create unique index if not exists ir_profile_claims_one_owner
  on ir_profile_claims (profile_num) where status = 'approved';

-- A member files a given claim once; re-asking updates that row.
create unique index if not exists ir_profile_claims_unique
  on ir_profile_claims (profile_num, user_id);

create index if not exists ir_profile_claims_user   on ir_profile_claims (user_id, created_at desc);
create index if not exists ir_profile_claims_status on ir_profile_claims (status, created_at desc);

-- Supabase's default privileges cover new tables in public, but this states it
-- rather than relying on it: without the grant every policy below is dead code.
grant select on ir_profile_claims to authenticated;

alter table ir_profile_claims enable row level security;

-- Same shape as every other member-readable table here: deny everything, then
-- open exactly one door. Writes go through the service role in the API, which
-- has already checked the session.
drop policy if exists deny_all on ir_profile_claims;
create policy deny_all on ir_profile_claims for all using (false);

drop policy if exists users_read_own_claims on ir_profile_claims;
create policy users_read_own_claims on ir_profile_claims
  for select using ((select auth.uid()) = user_id);


-- ## Member-readable rows on the tables /account/stats reads
--
-- Realtime will not deliver a postgres_changes event the subscriber could not
-- have selected, so each policy below is what makes the corresponding live
-- update possible at all. They are SELECT-only and self-scoped; every write
-- still goes through an API route holding the service role.
--
-- auth.uid() is the member's ir_user_profiles.id, because that is the `sub`
-- src/lib/supabase-token.ts mints. The same token carries an email claim,
-- which is what the two email-keyed tables below match on.

-- RLS is already enabled on all four (verified against pg_class.relrowsecurity
-- before writing this); these are no-ops kept so the file states the
-- precondition it depends on rather than assuming it.
alter table ir_interests   enable row level security;
alter table ir_comments    enable row level security;
alter table ir_user_usage  enable row level security;

drop policy if exists deny_all on ir_interests;
create policy deny_all on ir_interests for all using (false);
drop policy if exists users_read_own_interests on ir_interests;
create policy users_read_own_interests on ir_interests
  for select using (lower(from_email) = lower((select auth.jwt() ->> 'email')));

-- ir_orders is deliberately absent. Neither `anon` nor `authenticated` holds
-- SELECT on it — payments are reachable only through the service role — so a
-- row-level policy there would never fire, and granting the table in order to
-- make one fire would widen the payments surface to every signed-in session
-- for the sake of a live badge. /account reads payment state through the
-- API, which is the right side of that trade.

-- ir_comments already had deny_all and nothing else, so a member could not
-- read back even their own comment.
drop policy if exists users_read_own_comments on ir_comments;
create policy users_read_own_comments on ir_comments
  for select using ((select auth.uid()) = user_id);

drop policy if exists deny_all on ir_user_usage;
create policy deny_all on ir_user_usage for all using (false);
drop policy if exists users_read_own_usage on ir_user_usage;
-- user_id is text on this table alone — the others are uuid. Casting the uuid
-- to text (rather than the column to uuid) cannot throw on a row that was
-- written with something not uuid-shaped.
create policy users_read_own_usage on ir_user_usage
  for select using (user_id = (select auth.uid())::text);


-- ## Audience events for a listing the member has proven is theirs
--
-- ir_profile_events has had RLS on with no policy at all since 030 —
-- deliberately, because until this migration there was nobody who could
-- legitimately read a row. Now there is exactly one such person per listing,
-- and only for listings with an approved claim.
--
-- visitor_hash stays in the table and out of every API response: it is a
-- salted per-listing hash and not reversible, but it is also not something an
-- owner needs in order to count their own audience.
drop policy if exists users_read_claimed_profile_events on ir_profile_events;
create policy users_read_claimed_profile_events on ir_profile_events
  for select using (
    entity_type = 'profile'
    and entity_id in (
      select c.profile_num::text
      from ir_profile_claims c
      where c.user_id = (select auth.uid())
        and c.status  = 'approved'
    )
  );


-- ## Realtime
--
-- Guarded: adding a table already in the publication raises, and this
-- migration has to be safe to re-run.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ir_profile_claims', 'ir_interests',
    'ir_comments', 'ir_user_usage', 'ir_notifications', 'ir_story_views'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
