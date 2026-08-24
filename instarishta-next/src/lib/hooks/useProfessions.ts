'use client';
import { useEffect, useState } from 'react';
import type { Profession } from '@/lib/professions';

/**
 * The profession vocabulary, for client components.
 *
 * Module-level cache and a single in-flight promise: the badge renders in
 * lists (a story viewer sheet can hold dozens), and without this every
 * instance would fire its own request for the same tiny, near-static list.
 *
 * Fetches the FULL list including retired professions — a member who was
 * verified as something we no longer offer must still get their badge
 * rendered, and the alternative is a silent blank where a badge should be.
 */
let cache: Profession[] | null = null;
let inflight: Promise<Profession[]> | null = null;

function fetchProfessions(): Promise<Profession[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = fetch('/api/professions?all=1')
    .then(res => (res.ok ? res.json() : { professions: [] }))
    .then(data => {
      cache = (data.professions ?? []) as Profession[];
      return cache;
    })
    .catch(() => [] as Profession[])
    .finally(() => { inflight = null; });

  return inflight;
}

/** Drop the cache so the next read refetches — used after an admin edit. */
export function invalidateProfessions(): void {
  cache = null;
}

export function useProfessions(): { professions: Profession[]; loading: boolean } {
  const [professions, setProfessions] = useState<Profession[]>(() => cache ?? []);
  const [loading, setLoading] = useState(() => cache === null);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchProfessions().then(list => {
      if (cancelled) return;
      setProfessions(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { professions, loading };
}
