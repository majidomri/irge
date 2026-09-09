-- Listings move off GitHub and into this database, with the filters pushed
-- down into indexes.
--
-- ── What this replaces ───────────────────────────────────────────────────────
-- /profiles read jsdata.json from raw.githubusercontent.com through a
-- Cloudflare worker, and there were three caches in that path (the GitHub CDN,
-- the worker's 5-minute KV, Next's 30-minute unstable_cache). Every request
-- that missed pulled all 500 records into memory and filtered them in JS.
--
-- That is slow in the obvious way and fragile in a less obvious one: the whole
-- listing page depends on a third-party host staying up. The relay was
-- answering 522 while this was written, and /profiles was standing only
-- because Next still held a cached copy of a file it could no longer fetch.
--
-- ── Why the facet columns exist ──────────────────────────────────────────────
-- Every filter the UI offers is a REGEX OVER FREE TEXT, not a field:
-- education, marital status, location and community are all patterns matched
-- against `body` at request time (app/profiles/_shared.ts). Moving the rows
-- into Postgres without moving those derivations would just relocate the same
-- full scan.
--
-- So the patterns run ONCE, at write time, in generated columns, and land in
-- `facets text[]` under a GIN index. Filtering is then `facets @> ARRAY[...]`
-- — an index lookup instead of 500 regex evaluations. Because the columns are
-- GENERATED, a row inserted by hand from /nizam gets the same facets with no
-- application code involved; there is no way to write a row that disagrees
-- with the filters.
--
-- ── Parity is deliberate, including where it is imperfect ────────────────────
-- The patterns below are transcribed from _shared.ts so that the same query
-- returns the same listings it does today. Two notes on that:
--
--   * JS `\b` is a word boundary. Postgres `\b` is a BACKSPACE character —
--     the word-boundary escape here is `\y`. Transcribing `\b` literally
--     would silently match nothing.
--
--   * The feed carries structured `age` and `education` fields, and the
--     current filters IGNORE both, deriving age from the Urdu text instead
--     ("عمر NN") and treating an unparseable age as a match. That is kept, so
--     this migration changes no visitor's results. Both fields are stored, so
--     switching the age filter to trust `age_declared` is a one-line change
--     later — but it would drop listings that pass today, and that belongs in
--     its own change where the effect is visible.

begin;

-- Substring search (`?q=`) is `body ILIKE '%q%'`, which no btree can serve.
create extension if not exists pg_trgm;

-- ── The listings ─────────────────────────────────────────────────────────────

create table if not exists public.ir_profile_ads (
  -- The upstream feed id. Stable and unique across all 500 rows, and already
  -- what the rest of the app persists against (see types/profile.ts) — so it
  -- stays the primary key rather than being replaced by a fresh serial.
  id            bigint primary key,

  -- Position in the feed. This, ordered ascending, IS the default sort, and
  -- it is what `_num` counts — the number shown on a card and accepted by
  -- `?id=`. Kept as a real column so the order survives edits and does not
  -- depend on insertion order or on `id` being monotonic.
  seq           integer not null,

  title         text not null,
  body          text not null,
  gender        text not null check (gender in ('male', 'female')),

  phone         text,
  whatsapp      text,

  -- As the feed declares them. Not used by the filters — see the note above.
  age_declared  smallint,
  education     text,
  priority      text,

  audio_url          text,
  instagram_post_id  text,

  -- When the ad was posted upstream, not when this row was written.
  posted_at     timestamptz,

  -- Hidden here rather than in ir_hidden_listings so the filter is part of the
  -- indexed query. A hidden ad is excluded before `_num` is assigned, which is
  -- how moderation already behaves (page.tsx applies withoutHidden first).
  hidden        boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- ── Derived, once, at write time ───────────────────────────────────────────

  is_urgent boolean generated always as (
    body ~* 'urgent|جلد|ارجنٹ'
  ) stored,

  -- NULL when the body carries no age, which the filter treats as a match —
  -- the same as JS parseAge() returning 0.
  age_years smallint generated always as (
    nullif(substring(body from 'عمر\s+(\d{2})'), '')::smallint
  ) stored,

  /**
   * Every categorical filter, flattened into one GIN-indexed array.
   *
   * One array and one operator beats a column per facet: adding a location or
   * an education tier later is an ALTER of this expression, not a new column
   * plus a new index plus a new branch in the query.
   *
   * array_remove(..., null) is what makes the CASEs composable — a CASE with
   * no ELSE yields NULL, so each test contributes its tag or nothing.
   */
  facets text[] generated always as (
    array_remove(ARRAY[
      -- Education (matchesEdu)
      case when body ~* 'mbbs|m\.?b\.?b\.?s|bds|doctor|md\y'                then 'edu:doctor'       end,
      case when body ~* 'b\.?tech|m\.?tech|engineer|software|b\.e\y'        then 'edu:engineer'     end,
      case when body ~* '\ymba\y|\ybba\y'                                   then 'edu:mba'          end,
      case when body ~* '\yms\y|\ym\.sc\y|\ymsc\y'                          then 'edu:ms'           end,
      case when body ~* '\yb\.com\y|\yba\y|\ybsc\y|\ygraduate\y'            then 'edu:graduate'     end,
      case when body ~* 'hafiz|aalim|qur''?an|قرآن'                          then 'edu:hafiz'        end,
      case when body ~* '\yphd\y'                                           then 'edu:phd'          end,
      case when body ~* '\yssc\y|\yintermediate\y|\ymatric\y'               then 'edu:intermediate' end,

      -- Marital (matchesMarital). "never married" is the absence of the other
      -- two, exactly as the JS reads it — not a positive claim in the text.
      case when body ~* 'divorced|khula|طلاق'                               then 'marital:divorced' end,
      case when body ~* 'widow|بیوہ'                                        then 'marital:widow'    end,
      case when body !~* 'divorced|khula|طلاق|widow|بیوہ'
                                                     then 'marital:never married' end,

      -- Location (matchesLocation) — substring tests, so no boundaries here.
      case when body ~* 'hyderabad|hyderabadi|حیدر آباد|حیدرآباد'            then 'loc:hyderabad' end,
      case when body ~* 'dubai|uae|saudi|qatar|kuwait|bahrain|oman|gulf|خلیج' then 'loc:gulf'    end,
      case when body ~* 'usa|united states|america|امریکہ'                   then 'loc:usa'       end,
      case when body ~* 'uk|united kingdom|britain|england|برطانیہ'          then 'loc:uk'        end,
      case when body ~* 'australia|آسٹریلیا'                                 then 'loc:australia' end,
      case when body ~* 'delhi|new delhi'                                    then 'loc:delhi'     end,
      case when body ~* 'mumbai|bombay'                                      then 'loc:mumbai'    end,
      case when body ~* 'bangalore|bengaluru|karnataka'                      then 'loc:karnataka' end,
      case when body ~* 'telangana|warangal|nizamabad'                       then 'loc:telangana' end,

      -- Community — a plain substring of the option value in the JS, so the
      -- five options are enumerated rather than pattern-matched.
      case when body ~* 'sunni'    then 'community:sunni'    end,
      case when body ~* 'shia'     then 'community:shia'     end,
      case when body ~* 'deobandi' then 'community:deobandi' end,
      case when body ~* 'barelvi'  then 'community:barelvi'  end,
      case when body ~* 'salafi'   then 'community:salafi'   end
    ], null)
  ) stored
);

comment on table public.ir_profile_ads is
  'Rishta listings, previously jsdata.json on GitHub behind a Cloudflare relay. Filter facets are generated columns so /nizam edits cannot drift from the filters.';

-- Default ordering and `_num`. Partial, because every read excludes hidden.
create index if not exists ir_profile_ads_seq_idx
  on public.ir_profile_ads (seq) where not hidden;

-- The categorical filters, all of them, through one operator.
create index if not exists ir_profile_ads_facets_idx
  on public.ir_profile_ads using gin (facets);

-- `?q=` is a substring match on both fields.
create index if not exists ir_profile_ads_search_idx
  on public.ir_profile_ads using gin ((title || ' ' || body) gin_trgm_ops);

create index if not exists ir_profile_ads_gender_idx on public.ir_profile_ads (gender) where not hidden;
create index if not exists ir_profile_ads_age_idx    on public.ir_profile_ads (age_years) where not hidden;

alter table public.ir_profile_ads enable row level security;

-- Listings are public — the whole page is browsable signed-out. Writes stay
-- with the service role, which is what /nizam and the importer use.
drop policy if exists ir_profile_ads_public_read on public.ir_profile_ads;
create policy ir_profile_ads_public_read on public.ir_profile_ads
  for select to anon, authenticated using (not hidden);

create or replace function public.ir_profile_ads_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ir_profile_ads_touch_trg on public.ir_profile_ads;
create trigger ir_profile_ads_touch_trg before update on public.ir_profile_ads
  for each row execute function public.ir_profile_ads_touch();

-- ── The query ────────────────────────────────────────────────────────────────

/**
 * One round trip: the page slice, the total, and the three headline counts.
 *
 * The counts have to be over the whole match rather than the page — "312
 * profiles found" stays true regardless of which 48 are on screen — and
 * computing them in the same CTE avoids a second pass over the same rows.
 *
 * `_num` is assigned in `base`, BEFORE the visitor's filters and after the
 * hidden exclusion. That ordering is what makes the number on a card stable:
 * it is the listing's position in the catalogue, not its position in whatever
 * the visitor happened to filter down to, so `?id=` still resolves to the same
 * ad after a filter changes.
 *
 * SECURITY INVOKER: the RLS policy above already scopes this to non-hidden
 * rows for every caller, so there is nothing to elevate.
 */
create or replace function public.ir_search_profile_ads(
  p_search     text    default '',
  p_num        integer default null,
  p_gender     text    default 'all',
  p_urgent     boolean default false,
  p_education  text    default '',
  p_marital    text    default '',
  p_state      text    default '',
  p_community  text    default '',
  p_age_min    integer default 18,
  p_age_max    integer default 60,
  p_sort       text    default 'default',
  p_limit      integer default 48,
  p_offset     integer default 0
)
returns table (
  total        bigint,
  male_count   bigint,
  female_count bigint,
  urgent_count bigint,
  rows         jsonb
)
language sql
stable
as $$
  with base as (
    select a.*, row_number() over (order by a.seq) as num
      from public.ir_profile_ads a
     where not a.hidden
  ),
  want as (
    -- Empty strings mean "no filter", so they must not become array entries.
    select array_remove(ARRAY[
      nullif('edu:'       || coalesce(p_education, ''), 'edu:'),
      nullif('marital:'   || coalesce(p_marital,   ''), 'marital:'),
      nullif('loc:'       || coalesce(p_state,     ''), 'loc:'),
      nullif('community:' || coalesce(p_community, ''), 'community:')
    ], null) as tags
  ),
  needle as (
    -- The JS search is String.includes() — a literal substring, where `%` and
    -- `_` mean themselves. Passed to ILIKE unescaped they become wildcards, so
    -- a visitor typing "100%" would match everything.
    select replace(replace(replace(coalesce(p_search, ''), '\', '\\'),
                           '%', '\%'), '_', '\_') as q
  ),
  filtered as (
    select b.* from base b, want w, needle n
     where (p_gender = 'all' or b.gender = p_gender)
       and (not p_urgent or b.is_urgent)
       and (coalesce(p_search, '') = ''
            or (b.title || ' ' || b.body) ilike '%' || n.q || '%')
       and (p_num is null or b.num = p_num)
       and (cardinality(w.tags) = 0 or b.facets @> w.tags)
       -- The age filter runs ONLY when the range has been narrowed, which is
       -- how the JS reads it: `if (f.ageMin > 18 || f.ageMax < 60)`. Applying
       -- it unconditionally is not the same thing — one listing in the
       -- catalogue parses to "عمر 13" out of a longer number, and it is
       -- visible today at default filters because the comparison never runs.
       -- Dropping it silently would have been a real, invisible change to
       -- what the front page shows.
       --
       -- Within a narrowed range, an ad whose text carries no age still
       -- passes, matching parseAge() returning 0.
       and (not (p_age_min > 18 or p_age_max < 60)
            or b.age_years is null
            or (b.age_years >= p_age_min and b.age_years <= p_age_max))
  )
  select
    (select count(*)                             from filtered),
    (select count(*) filter (where gender='male')   from filtered),
    (select count(*) filter (where gender='female') from filtered),
    (select count(*) filter (where is_urgent)       from filtered),
    coalesce(
      -- `ord` carries the sort out of the subquery so jsonb_agg can honour it
      -- — aggregate order is not inherited from a subquery's ORDER BY — and is
      -- then stripped from each object, since it is scaffolding and not part
      -- of the listing shape the client expects.
      (select jsonb_agg(to_jsonb(p) - 'ord' order by p.ord)
         from (
           select f.id, f.title, f.body, f.gender, f.phone, f.whatsapp,
                  f.age_declared as age, f.education, f.priority,
                  f.audio_url, f.instagram_post_id,
                  f.num as "_num",
                  -- Sorts are stable: each puts one group first and leaves
                  -- the catalogue order intact within it, which is what the
                  -- JS Array.sort comparators did.
                  row_number() over (
                    order by
                      case when p_sort = 'urgent' then (not f.is_urgent)
                           when p_sort = 'male'   then (f.gender <> 'male')
                           when p_sort = 'female' then (f.gender <> 'female')
                           else false end,
                      f.seq
                  ) as ord
             from filtered f
            order by ord
            limit  greatest(p_limit, 0)
           offset  greatest(p_offset, 0)
         ) p),
      '[]'::jsonb)
$$;

grant execute on function public.ir_search_profile_ads(
  text, integer, text, boolean, text, text, text, text, integer, integer, text, integer, integer
) to anon, authenticated, service_role;

commit;
