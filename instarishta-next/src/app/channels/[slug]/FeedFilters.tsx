'use client';

import { useMemo, useState } from 'react';
import type { IPost } from '@/lib/supabase';

/**
 * The RishtaSwipe filter modal, ported to the channel feed.
 *
 * This is a port, not a redesign: same trigger ("Show Filters" with the
 * sliders glyph), same dialog (a narrow centred card, header, 70vh scroll
 * area), same running order inside it -- Stats card first, then Search, then
 * a select per facet, then the age range, the urgent switch and a full-width
 * Clear. The facet selects build their option lists from the rows actually
 * present and print a count beside each, exactly as `Filters.tsx` does, so a
 * value nobody has is never offered.
 *
 * It is hand-built rather than imported because this app has no Radix and no
 * shadcn -- no Dialog, Slider, Switch or Card to reach for -- so the markup
 * reproduces what those components render. It also has no lucide, hence the
 * inline glyphs.
 *
 * Two honest differences from the original, both forced by the data:
 *
 *   - No height filter. `ir_posts` has no height; the original reads it off
 *     the profile document. Offering the control would be offering a slider
 *     that matches everything.
 *   - Most posts in a channel are WhatsApp imports with no biodata at all, so
 *     the panel says how many a facet filter cannot include. The original
 *     never needed that line because every profile it filtered had fields.
 */

const AGE = { min: 18, max: 60 };

export type FeedFilterState = {
  q: string;
  facets: Record<string, string>;
  age: [number, number];
  urgentOnly: boolean;
};

export const EMPTY_FILTERS: FeedFilterState = {
  q: '',
  facets: {},
  age: [AGE.min, AGE.max],
  urgentOnly: false,
};

/** Post columns offered as dropdown facets, in the order they appear. */
const FACETS: { key: keyof IPost; label: string }[] = [
  { key: 'gender', label: 'Bride / Groom' },
  { key: 'marital', label: 'Marital status' },
  { key: 'community', label: 'Community' },
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'education', label: 'Education' },
];

const PRETTY: Record<string, string> = {
  bride: 'Bride', groom: 'Groom',
  'never-married': 'Never married', divorced: 'Divorced',
  widowed: 'Widowed', separated: 'Separated',
};
const label = (v: string) => PRETTY[v] ?? v;

export function activeCount(f: FeedFilterState): number {
  return [
    !!f.q.trim(),
    ...Object.values(f.facets).map(Boolean),
    f.urgentOnly,
    f.age[0] > AGE.min || f.age[1] < AGE.max,
  ].filter(Boolean).length;
}

export function usesFacets(f: FeedFilterState): boolean {
  return Object.values(f.facets).some(Boolean) || f.urgentOnly;
}

export function applyFeedFilters(posts: IPost[], f: FeedFilterState): IPost[] {
  const q = f.q.trim().toLowerCase();

  return posts.filter((p) => {
    if (q) {
      const hay = `${p.title ?? ''} ${p.caption ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    for (const [key, want] of Object.entries(f.facets)) {
      if (!want) continue;
      const got = p[key as keyof IPost];
      if (got == null || got === '') return false;
      if (String(got) !== want) return false;
    }

    if (f.urgentOnly && !p.is_urgent) return false;

    // An unanswered age never excludes a post -- filtering on a blank is the
    // same mistake as rendering one. The original keeps this rule too.
    if (typeof p.age === 'number' && (p.age < f.age[0] || p.age > f.age[1])) return false;

    return true;
  });
}

const GREEN = '#00A86B';
const LINE = 'rgba(255,255,255,0.12)';
const MUTED = 'rgba(255,255,255,0.5)';

export default function FeedFilters({
  posts,
  value,
  onChange,
  matched,
}: {
  posts: IPost[];
  value: FeedFilterState;
  onChange: (next: FeedFilterState) => void;
  /** What the current filters left, for the Stats card. */
  matched: IPost[];
}) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof FeedFilterState>(k: K, v: FeedFilterState[K]) =>
    onChange({ ...value, [k]: v });

  /** Only values someone actually has are offered, with their counts. */
  const facets = useMemo(
    () =>
      FACETS.map(({ key, label: facetLabel }) => {
        const counts = new Map<string, number>();
        for (const p of posts) {
          const raw = p[key];
          if (raw == null || raw === '') continue;
          const s = String(raw);
          counts.set(s, (counts.get(s) ?? 0) + 1);
        }
        if (!counts.size) return null;
        return {
          key: key as string,
          label: facetLabel,
          options: [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([v, count]) => ({ value: v, count, label: label(v) })),
        };
      }).filter(Boolean) as { key: string; label: string; options: { value: string; count: number; label: string }[] }[],
    [posts],
  );

  const stats = useMemo(() => ({
    total: matched.length,
    grooms: matched.filter((p) => p.gender === 'groom').length,
    brides: matched.filter((p) => p.gender === 'bride').length,
    urgent: matched.filter((p) => p.is_urgent).length,
  }), [matched]);

  const unfilterable = posts.filter((p) => p.gender == null).length;
  const n = activeCount(value);

  // Nothing in this channel carries biodata: the panel would be a search box
  // and four empty selects, so it stays out of the way.
  if (facets.length === 0) return null;

  /** What is switched on right now, as removable chips. */
  const active: { label: string; clear: () => void }[] = [];
  if (value.q.trim()) {
    active.push({ label: `"${value.q.trim()}"`, clear: () => onChange({ ...value, q: '' }) });
  }
  for (const [key, v] of Object.entries(value.facets)) {
    if (!v) continue;
    active.push({
      label: label(v),
      clear: () => onChange({ ...value, facets: { ...value.facets, [key]: '' } }),
    });
  }
  if (value.urgentOnly) {
    active.push({ label: 'Urgent', clear: () => onChange({ ...value, urgentOnly: false }) });
  }
  if (value.age[0] > 18 || value.age[1] < 60) {
    active.push({
      label: `${value.age[0]}–${value.age[1]} yrs`,
      clear: () => onChange({ ...value, age: [18, 60] }),
    });
  }

  return (
    <>
      {/* What is on, in the flow — the FAB says how many, this says which, and
          each one comes off on its own. */}
      {active.length > 0 && (
        <div style={{ background: '#0B0B0A' }} className="px-4 pb-3 flex gap-2 overflow-x-auto items-center"
          >
          {active.map((a) => (
            <button
              key={a.label}
              onClick={a.clear}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border"
              style={{ background: 'rgba(0,168,107,0.16)', color: GREEN, borderColor: 'rgba(0,168,107,0.45)' }}
            >
              {a.label}
              <span aria-hidden style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
          <button
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border"
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', borderColor: LINE }}
          >
            Clear all
          </button>
        </div>
      )}

      {/*
        The trigger is a FAB, not a row.
        As an inline button it scrolled away with the feed, so changing a
        filter meant scrolling back to the top first. Fixed in the bottom-right
        thumb arc it is reachable one-handed at any scroll position, and it
        sits above the site's bottom nav rather than over it.
      */}
      <button
        onClick={() => setOpen(true)}
        aria-label={n > 0 ? `Filters, ${n} active` : 'Filters'}
        className="fixed right-4 z-[120] flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold border shadow-lg"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
          background: n > 0 ? GREEN : '#141413',
          color: n > 0 ? '#0B0B0A' : '#fff',
          borderColor: n > 0 ? GREEN : LINE,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}
      >
        <SlidersIcon />
        Filters
        {n > 0 && (
          <span className="rounded-full px-1.5 text-[11px] font-extrabold"
            style={{ background: '#0B0B0A', color: GREEN }}>{n}</span>
        )}
      </button>

      {open && (
        /*
          One panel, two shapes.

          On a phone it stays the centred card this was ported as — thumbs
          reach the middle of the screen better than an edge. From `md` up it
          becomes a drawer sliding in from the right and running the full
          height: a mouse has no thumb arc, and a persistent side panel is
          where a filter column belongs on a desktop feed. 420px is wide
          enough for the two-column Stats card and the full-width selects to
          keep their hit areas without the dialog feeling cramped.
        */
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:items-stretch md:justify-end md:p-0"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setOpen(false)}
        >
          <style>{`
            .ir-filter-panel { animation: ir-filter-pop .18s ease-out; }
            @keyframes ir-filter-pop { from { opacity: 0; transform: translateY(12px); } }
            @media (min-width: 768px) {
              .ir-filter-panel { animation: ir-filter-slide .22s ease-out; }
              @keyframes ir-filter-slide { from { transform: translateX(100%); } }
            }
            @media (prefers-reduced-motion: reduce) { .ir-filter-panel { animation: none; } }
          `}</style>
          <div
            className="ir-filter-panel w-full max-w-sm rounded-2xl overflow-hidden md:max-w-none md:w-[420px] md:h-full md:rounded-none"
            style={{ background: '#141413', border: `1px solid ${LINE}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h2 className="text-lg font-bold text-white">Filters</h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
                aria-label="Close filters"
              >
                ×
              </button>
            </div>

            {/* As a card this scrolls to 70vh; as a drawer it owns the column,
                so it takes everything the header leaves. */}
            <div className="overflow-y-auto max-h-[70vh] md:max-h-none md:h-[calc(100%-68px)]">
              <div className="p-6 flex flex-col gap-6">
                {/* ── Stats ── */}
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${LINE}` }}>
                  <p className="text-sm font-bold text-white mb-4">Statistics</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Total Matches" value={stats.total} tint={GREEN} glyph={<UsersIcon />} />
                    <Stat label="Grooms" value={stats.grooms} tint="#3B82F6" glyph={<UserIcon />} />
                    <Stat label="Brides" value={stats.brides} tint="#EC4899" glyph={<UserPlusIcon />} />
                    <Stat label="Urgent" value={stats.urgent} tint="#F59E0B" glyph={<ZapIcon />} />
                  </div>
                </div>

                {/* ── Search ── */}
                <Field label="Search">
                  <input
                    value={value.q}
                    onChange={(e) => set('q', e.target.value)}
                    placeholder="Name, ID or a word from their description"
                    className="w-full rounded-md px-3 py-2 text-sm outline-none border"
                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: LINE, color: '#fff' }}
                  />
                </Field>

                {/* ── One select per facet ── */}
                {facets.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <select
                      value={value.facets[f.key] ?? ''}
                      onChange={(e) => set('facets', { ...value.facets, [f.key]: e.target.value })}
                      className="w-full rounded-md px-3 py-2 text-sm outline-none border"
                      style={{ background: 'rgba(255,255,255,0.06)', borderColor: LINE, color: '#fff' }}
                    >
                      <option value="">Any</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} ({o.count})
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}

                {/* ── Age ── */}
                <Field label={`Age · ${value.age[0]}–${value.age[1]}`}>
                  <DualRange
                    min={AGE.min}
                    max={AGE.max}
                    value={value.age}
                    onChange={(v) => set('age', v)}
                  />
                </Field>

                {/* ── Urgent ── */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Looking urgently only</span>
                  <button
                    role="switch"
                    aria-checked={value.urgentOnly}
                    onClick={() => set('urgentOnly', !value.urgentOnly)}
                    className="relative rounded-full transition-colors"
                    style={{
                      width: 44, height: 24,
                      background: value.urgentOnly ? GREEN : 'rgba(255,255,255,0.18)',
                    }}
                  >
                    <span
                      className="absolute rounded-full transition-all"
                      style={{
                        width: 18, height: 18, top: 3,
                        left: value.urgentOnly ? 23 : 3,
                        background: '#fff',
                      }}
                    />
                  </button>
                </div>

                {unfilterable > 0 && usesFacets(value) && (
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {unfilterable} post{unfilterable === 1 ? '' : 's'} in this channel carry no
                    biodata details, so these filters cannot include them.
                  </p>
                )}

                <button
                  onClick={() => onChange({ ...EMPTY_FILTERS })}
                  className="w-full rounded-md py-2 text-sm font-semibold border"
                  style={{ background: 'transparent', borderColor: LINE, color: '#fff' }}
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-white">{text}</span>
      {children}
    </div>
  );
}

function Stat({ label: text, value, tint, glyph }: {
  label: string; value: number; tint: string; glyph: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-md" style={{ background: `${tint}33`, color: tint }}>
        {glyph}
      </div>
      <div>
        <p className="text-xs" style={{ color: MUTED }}>{text}</p>
        <p className="text-xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

/**
 * Two thumbs on one track, which is what the original's Slider gives.
 * The inputs are stacked; each only takes pointer events on its own thumb so
 * the lower one is still reachable where the ranges overlap.
 */
function DualRange({ min, max, value, onChange }: {
  min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void;
}) {
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className="relative" style={{ height: 24 }}>
      <div className="absolute rounded-full" style={{ left: 0, right: 0, top: 10, height: 4, background: 'rgba(255,255,255,0.18)' }} />
      <div
        className="absolute rounded-full"
        style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%`, top: 10, height: 4, background: GREEN }}
      />
      <input
        type="range" min={min} max={max} value={value[0]}
        onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])}
        className="ir-thumb absolute w-full" style={{ top: 0, accentColor: GREEN }}
        aria-label="Minimum age"
      />
      <input
        type="range" min={min} max={max} value={value[1]}
        onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])}
        className="ir-thumb absolute w-full" style={{ top: 0, accentColor: GREEN }}
        aria-label="Maximum age"
      />
      <style>{`
        .ir-thumb {
          -webkit-appearance: none; appearance: none;
          background: transparent; height: 24px; margin: 0;
          pointer-events: none;
        }
        .ir-thumb::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 9999px;
          background: #fff; border: 2px solid ${GREEN};
          pointer-events: auto; cursor: pointer;
        }
        .ir-thumb::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 9999px;
          background: #fff; border: 2px solid ${GREEN};
          pointer-events: auto; cursor: pointer;
        }
      `}</style>
    </div>
  );
}

/* Lucide's glyphs, inlined -- this app does not carry the icon package. */
const svg = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const SlidersIcon = () => (
  <svg {...svg} width={16} height={16}><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></svg>
);
const UsersIcon = () => (
  <svg {...svg}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const UserIcon = () => (
  <svg {...svg}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
const UserPlusIcon = () => (
  <svg {...svg}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
);
const ZapIcon = () => (
  <svg {...svg}><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>
);
