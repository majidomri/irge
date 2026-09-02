'use client';

import { useMemo, useState } from 'react';
import type { IPost } from '@/lib/supabase';

/**
 * Filters for the channel feed, in the shape /profiles uses.
 *
 * The browse page can filter by gender, community, education, marital status,
 * state and age because it reads structured profile records. A post is a
 * picture, and for most of this feed that is all it will ever be -- the
 * WhatsApp imports carry no biodata anyone can query. Posts published from
 * the live show do, because they are generated from the registry and the
 * publisher writes the facets alongside the pixels (migration 024).
 *
 * So this deliberately does NOT mirror the browse page's control set. Every
 * option offered is derived from the posts actually loaded, so a value that
 * would match nothing is never shown, and the panel says plainly how many
 * posts cannot answer a facet question at all rather than dropping them
 * silently. A filter that quietly hides four thousand imports would read as
 * a broken feed.
 */

export type FeedFilterState = {
  q: string;
  gender: string;
  community: string;
  education: string;
  marital: string;
  state: string;
  ageMin: number;
  ageMax: number;
  urgentOnly: boolean;
  sort: 'newest' | 'views' | 'likes';
};

export const EMPTY_FILTERS: FeedFilterState = {
  q: '', gender: 'all', community: '', education: '', marital: '', state: '',
  ageMin: 18, ageMax: 60, urgentOnly: false, sort: 'newest',
};

const AGE_FLOOR = 18;
const AGE_CEIL = 60;

export function activeCount(f: FeedFilterState): number {
  return [
    !!f.q, f.gender !== 'all', !!f.community, !!f.education, !!f.marital,
    !!f.state, f.urgentOnly, f.sort !== 'newest',
    f.ageMin > AGE_FLOOR || f.ageMax < AGE_CEIL,
  ].filter(Boolean).length;
}

/** True when this filter set asks a question only a faceted post can answer. */
export function usesFacets(f: FeedFilterState): boolean {
  return (
    f.gender !== 'all' || !!f.community || !!f.education || !!f.marital ||
    !!f.state || f.urgentOnly || f.ageMin > AGE_FLOOR || f.ageMax < AGE_CEIL
  );
}

export function applyFeedFilters(posts: IPost[], f: FeedFilterState): IPost[] {
  const q = f.q.trim().toLowerCase();
  const out = posts.filter((p) => {
    if (q) {
      const hay = `${p.title ?? ''} ${p.caption ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.gender !== 'all' && p.gender !== f.gender) return false;
    if (f.community && p.community !== f.community) return false;
    if (f.education && p.education !== f.education) return false;
    if (f.marital && p.marital !== f.marital) return false;
    if (f.state && p.state !== f.state) return false;
    if (f.urgentOnly && !p.is_urgent) return false;
    if (f.ageMin > AGE_FLOOR || f.ageMax < AGE_CEIL) {
      if (typeof p.age !== 'number') return false;
      if (p.age < f.ageMin || p.age > f.ageMax) return false;
    }
    return true;
  });

  if (f.sort === 'views') return [...out].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  if (f.sort === 'likes') return [...out].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  return out;
}

/** Values actually present, with their counts. Never offers a dead option. */
function options(posts: IPost[], key: keyof IPost): { value: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const v = p[key];
    if (typeof v !== 'string' || !v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, n]) => ({ value, n }))
    .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

const GREEN = '#00A86B';
const chip = (on: boolean) => ({
  background: on ? GREEN : 'rgba(255,255,255,0.08)',
  color: on ? '#0B0B0A' : 'rgba(255,255,255,0.7)',
  borderColor: on ? GREEN : 'rgba(255,255,255,0.12)',
});

export default function FeedFilters({
  posts,
  value,
  onChange,
}: {
  posts: IPost[];
  value: FeedFilterState;
  onChange: (next: FeedFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<FeedFilterState>) => onChange({ ...value, ...patch });

  const communities = useMemo(() => options(posts, 'community'), [posts]);
  const educations = useMemo(() => options(posts, 'education'), [posts]);
  const maritals = useMemo(() => options(posts, 'marital'), [posts]);
  const states = useMemo(() => options(posts, 'state'), [posts]);
  const genders = useMemo(() => options(posts, 'gender'), [posts]);
  const faceted = useMemo(() => posts.filter((p) => p.gender != null).length, [posts]);

  const n = activeCount(value);
  const unfilterable = posts.length - faceted;

  // Nothing in this channel carries facets and nobody has typed anything:
  // the panel would be a row of empty selects, so it stays out of the way.
  if (faceted === 0 && !value.q && n === 0) return null;

  return (
    <div style={{ background: '#0B0B0A' }}>
      <div className="px-4 pb-3 flex items-center gap-2">
        <input
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search these posts"
          className="flex-1 rounded-full px-4 py-2 text-sm outline-none border"
          style={{
            background: 'rgba(255,255,255,0.06)',
            borderColor: 'rgba(255,255,255,0.12)',
            color: '#fff',
          }}
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold border"
          style={chip(open || n > 0)}
        >
          Filters{n > 0 ? ` · ${n}` : ''}
        </button>
        {n > 0 && (
          <button
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold border"
            style={chip(false)}
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {genders.length > 0 && (
            <Row label="Looking for">
              <Chip on={value.gender === 'all'} onClick={() => set({ gender: 'all' })}>
                Anyone
              </Chip>
              {genders.map((g) => (
                <Chip
                  key={g.value}
                  on={value.gender === g.value}
                  onClick={() => set({ gender: value.gender === g.value ? 'all' : g.value })}
                >
                  {g.value === 'bride' ? 'Brides' : g.value === 'groom' ? 'Grooms' : g.value}
                  <span className="opacity-60 ml-1">{g.n}</span>
                </Chip>
              ))}
            </Row>
          )}

          <Select label="Community" value={value.community} opts={communities} onPick={(v) => set({ community: v })} />
          <Select label="Education" value={value.education} opts={educations} onPick={(v) => set({ education: v })} />
          <Select label="Marital status" value={value.marital} opts={maritals} onPick={(v) => set({ marital: v })} />
          <Select label="State" value={value.state} opts={states} onPick={(v) => set({ state: v })} />

          <Row label={`Age ${value.ageMin}–${value.ageMax}`}>
            <input
              type="range" min={AGE_FLOOR} max={AGE_CEIL} value={value.ageMin}
              onChange={(e) => set({ ageMin: Math.min(Number(e.target.value), value.ageMax) })}
              className="flex-1" style={{ accentColor: GREEN }}
            />
            <input
              type="range" min={AGE_FLOOR} max={AGE_CEIL} value={value.ageMax}
              onChange={(e) => set({ ageMax: Math.max(Number(e.target.value), value.ageMin) })}
              className="flex-1" style={{ accentColor: GREEN }}
            />
          </Row>

          <Row label="Sort">
            {(['newest', 'views', 'likes'] as const).map((s) => (
              <Chip key={s} on={value.sort === s} onClick={() => set({ sort: s })}>
                {s === 'newest' ? 'Newest' : s === 'views' ? 'Most viewed' : 'Most liked'}
              </Chip>
            ))}
            <Chip on={value.urgentOnly} onClick={() => set({ urgentOnly: !value.urgentOnly })}>
              Urgent only
            </Chip>
          </Row>

          {/* Said out loud rather than left as a mysteriously short feed. */}
          {unfilterable > 0 && usesFacets(value) && (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {unfilterable} post{unfilterable === 1 ? '' : 's'} in this channel carry no biodata
              details, so these filters cannot include them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold shrink-0" style={{ color: 'rgba(255,255,255,0.45)', minWidth: 92 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all"
      style={chip(on)}
    >
      {children}
    </button>
  );
}

function Select({
  label, value, opts, onPick,
}: {
  label: string;
  value: string;
  opts: { value: string; n: number }[];
  onPick: (v: string) => void;
}) {
  if (opts.length === 0) return null;
  return (
    <Row label={label}>
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="rounded-full px-3 py-1.5 text-xs font-semibold border outline-none"
        style={{
          background: value ? GREEN : 'rgba(255,255,255,0.08)',
          color: value ? '#0B0B0A' : 'rgba(255,255,255,0.7)',
          borderColor: value ? GREEN : 'rgba(255,255,255,0.12)',
        }}
      >
        <option value="">Any</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value} ({o.n})
          </option>
        ))}
      </select>
    </Row>
  );
}
