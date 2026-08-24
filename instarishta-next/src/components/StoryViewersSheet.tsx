'use client';
import { useEffect, useState } from 'react';
import { professionIcon, professionLabel } from '@/lib/professions';
import { useProfessions } from '@/lib/hooks/useProfessions';

interface Viewer {
  id: string;
  name: string;
  professionKey: string | null;
  viewedAt: string;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

/**
 * "Seen by" — the list of members who watched one of *your* stories.
 *
 * Only ever rendered for the owner; /api/stories/[id]/viewers 403s anyone
 * else, so this component never needs to reason about authorisation itself.
 *
 * Each row leads with the viewer's verified profession rather than their
 * name, because that is the information the owner is actually weighing on a
 * matrimonial site — "a doctor viewed you" carries the signal, "Aisha viewed
 * you" doesn't, unless you already know Aisha.
 */
export default function StoryViewersSheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [count, setCount]     = useState(0);
  const [error, setError]     = useState<string | null>(null);
  const { professions }       = useProfessions();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/stories/${storyId}/viewers`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(data.error ?? 'Could not load viewers'); setViewers([]); return; }
        setViewers(data.viewers ?? []);
        setCount(data.count ?? 0);
      } catch {
        if (!cancelled) { setError('Could not load viewers'); setViewers([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [storyId]);

  return (
    <div className="fixed inset-0 flex items-end" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

        <div className="sticky top-0 bg-white border-b border-neutral-100 px-5 pt-4 pb-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />
          <h2 className="text-base font-semibold text-neutral-900">
            {viewers === null ? 'Seen by' : `Seen by ${count}`}
          </h2>
        </div>

        {viewers === null && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Loading…</p>
        )}

        {error && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">{error}</p>
        )}

        {viewers !== null && !error && viewers.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            No one has seen this story yet.
          </p>
        )}

        <ul className="list-none m-0 p-0">
          {(viewers ?? []).map(v => (
            <li key={v.id} className="flex items-center gap-3 px-5 py-3 border-b border-neutral-50">
              <span className="text-xl" aria-hidden>{professionIcon(professions, v.professionKey)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">{v.name}</span>
                {v.professionKey && (
                  <span className="block text-xs text-neutral-500">
                    {professionLabel(professions, v.professionKey)} · Verified
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-neutral-400">{timeAgo(v.viewedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
