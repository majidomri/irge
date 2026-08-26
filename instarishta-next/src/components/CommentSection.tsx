'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { COMMENT_CHIPS } from '@/lib/comment-chips';

const AuthModal = dynamic(() => import('./AuthModal'), { ssr: false });

interface CommentItem {
  id: string;
  author_name: string;
  chip_key: string;
  created_at: string;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/**
 * Public comment thread + chip picker for a channel post or story.
 *
 * Unlike the private /profiles interest chips, these ARE shown publicly —
 * so posting requires a signed-in, bannable account (see /api/comments),
 * and the vocabulary stays fixed (no free text) to keep the harassment
 * surface as small as it can be while still being public. The dark panel,
 * empty state, and "suggested reply" framing of the chip row are modeled on
 * a reference design — the fixed-vocabulary chips ARE the composer here,
 * deliberately: there is no free-text box to add, unlike that reference.
 *
 * Embedded both inline (full /post/[slug] page) and inside a bottom-sheet
 * drawer over the in-feed post viewer — this component owns no page chrome
 * so it works in either shell.
 */
interface Quota { used: number; remaining: number; limit: number; resetAt: string | null }

export default function CommentSection({
  entityType, entityId, initialComments, initialCount, fill = false,
}: {
  entityType: 'post' | 'story';
  entityId: string;
  initialComments?: CommentItem[];
  initialCount?: number;
  /**
   * Fill the parent and keep the composer pinned to its bottom edge, with only
   * the thread scrolling. Used by the drawer. The inline embed on /p sits in
   * normal page flow, where a pinned composer would have nothing to pin to.
   */
  fill?: boolean;
}) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments ?? []);
  const [count, setCount]       = useState(initialCount ?? initialComments?.length ?? 0);
  const [loading, setLoading]   = useState(initialComments === undefined);
  const [posted, setPosted]     = useState<Set<string>>(new Set());
  const [posting, setPosting]   = useState<string | null>(null);
  const [error, setError]       = useState('');
  const [authGate, setAuthGate] = useState(false);
  const [quota, setQuota]       = useState<Quota | null>(null);

  /**
   * Load the thread, and reload it whenever the target entity changes.
   *
   * This used to run once on mount ("only ever runs for the entity this
   * component was mounted for"), which held while the drawer was torn down
   * between posts. It no longer is: the docked drawer stays open as you
   * navigate the feed, the way YouTube keeps its comment panel up while you
   * move between Shorts. The frame stays mounted and only its contents
   * change, so re-targeting has to happen here rather than by remounting —
   * a remount would flash the whole panel on every navigation.
   *
   * The SSR path (/p/[slug] passes initialComments) still skips the fetch for
   * the entity it was rendered with, and only fetches if the target moves.
   */
  const ssrEntityRef = useRef(initialComments !== undefined ? entityId : null);

  useEffect(() => {
    if (initialComments !== undefined && entityId === ssrEntityRef.current) return;

    let cancelled = false;
    // Per-entity state must not leak across a re-target: chips already posted
    // on the previous post are not posted on this one.
    setPosted(new Set());
    setPosting(null);
    setError('');
    setQuota(null);
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/comments?entityType=${entityType}&entityId=${entityId}`);
        const data = await res.json();
        if (cancelled) return;   // a fast navigation must not overwrite the newer thread
        setComments(data.comments ?? []);
        setCount(data.count ?? 0);
        setQuota(data.quota ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // initialComments is a server-render seed, not a reactive input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function submit(chipKey: string) {
    if (posting || posted.has(chipKey)) return;
    setPosting(chipKey);
    setError('');
    try {
      const res = await fetch('/api/comments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entityType, entityId, chipKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthGate(true);
      } else if (res.ok) {
        setComments(c => [data.comment, ...c]);
        setCount(c => c + 1);
        setPosted(p => new Set(p).add(chipKey));
        if (data.quota) setQuota(data.quota);
      } else {
        // 429 carries the refreshed quota, so a rejected post still leaves the
        // composer showing the truth rather than a stale allowance.
        if (data.quota) setQuota(data.quota);
        setError(data.error || 'Could not post — please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPosting(null);
    }
  }

  const exhausted = quota !== null && quota.remaining <= 0;

  return (
    <div
      style={{ background: '#141413', color: '#fff', borderRadius: fill ? 0 : 16 }}
      className={fill ? 'flex flex-col h-full min-h-0' : ''}
    >
      {/* ── Thread (scrolls) ── */}
      <div className={fill ? 'flex-1 min-h-0 overflow-y-auto p-4' : 'p-4'}>
      <p className="text-xs font-bold uppercase tracking-[0.08em] mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {count} {count === 1 ? 'comment' : 'comments'}
      </p>

      {!loading && comments.length === 0 && (
        <div className="flex flex-col items-center text-center py-6 mb-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'rgba(0,168,107,0.12)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-bold mb-1">Start the conversation</p>
          <p className="text-xs max-w-[240px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Comments and interest appear here. Be the first to say something.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading comments…</p>
      ) : comments.length > 0 && (
        <div className="flex flex-col gap-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {comments.map((c, i) => {
            const chip = COMMENT_CHIPS.find(k => k.key === c.chip_key);

            /**
             * One member may post one comment per chip (the unique constraint
             * is per chip_key, not per person — see migration 010), so a single
             * person can legitimately leave several. Repeating their name and
             * avatar on every row made a thread of four signals from one family
             * read like spam.
             *
             * Consecutive rows by the same author are grouped the way iMessage
             * and Slack do it: the name, avatar and timestamp appear once at the
             * head of the run, and the rest are just their messages. Grouping is
             * by author_name because the public GET deliberately does not expose
             * user_id — two different members with an identical display name
             * would merge, which is a cosmetic edge case, not a data one.
             */
            const isRunHead = i === 0 || comments[i - 1].author_name !== c.author_name;

            return (
              <div key={c.id} className={`flex items-start gap-2.5 ${isRunHead ? '' : '-mt-2'}`}>
                {isRunHead ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'rgba(0,168,107,0.18)', color: '#00E08C' }}>
                    {initialOf(c.author_name)}
                  </div>
                ) : (
                  /* Keeps the run's messages aligned under the first one. */
                  <div className="w-8 shrink-0" aria-hidden="true" />
                )}
                {/* The thread shows the full sentence, not the chip face —
                    a published comment should read as something a family
                    wrote, even though the member only tapped a chip. */}
                <div className="pt-0.5 min-w-0">
                  {isRunHead && (
                    <p className="text-sm leading-snug">
                      <span className="font-bold text-white">{c.author_name}</span>{' '}
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>· {timeAgo(c.created_at)}</span>
                    </p>
                  )}
                  <p className="text-sm leading-snug mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>
                    {chip?.icon} {chip?.message ?? c.chip_key}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* ── Composer (pinned to the bottom edge) ──
          Shaped like a message bar rather than a block of suggestions: the
          chips ARE the input here (there is deliberately no free-text field —
          see comment-chips.ts), so they belong where a text box would be, at
          the bottom, not stacked above the thread you are replying to. */}
      <div
        className={`${fill ? 'shrink-0' : 'mt-4'} px-4 pt-3 pb-4`}
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#141413' }}
      >
        {error && <p className="text-xs font-semibold mb-2" style={{ color: '#FF8B5A' }}>{error}</p>}

        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {exhausted ? 'Daily limit reached' : 'Say something'}
          </p>
          {quota && (
            <p className="text-[10px] font-bold tabular-nums"
              style={{ color: exhausted ? '#FF8B5A' : 'rgba(255,255,255,0.35)' }}>
              {quota.remaining} of {quota.limit} left today
            </p>
          )}
        </div>

        {exhausted ? (
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            You&apos;ve sent your messages for today on this profile.
            {quota?.resetAt && ` You can send more ${timeUntil(quota.resetAt)}.`}
          </p>
        ) : (
          <>
            {/* One scrolling row, like a sticker tray — a wrapped block of ten
                chips would eat half the panel and push the thread off screen. */}
            {/* Defined here rather than relying on .ir-no-scrollbar, which
                only exists in the channel page's <style> block — this
                component also renders inline on /p, where that is absent. */}
            <style>{`
              .ir-chiprow { scrollbar-width: none; -ms-overflow-style: none; }
              .ir-chiprow::-webkit-scrollbar { width: 0; height: 0; display: none; }
            `}</style>
            <div className="ir-chiprow flex gap-2 overflow-x-auto pb-1">
              {COMMENT_CHIPS.map(c => {
                const done = posted.has(c.key);
                return (
                  <button key={c.key} type="button" disabled={posting !== null || done}
                    onClick={() => submit(c.key)} title={c.message}
                    className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold border disabled:opacity-60 shrink-0 whitespace-nowrap"
                    style={{
                      borderColor: done ? '#00A86B' : 'rgba(255,255,255,0.15)',
                      background:  done ? 'rgba(0,168,107,0.15)' : 'rgba(255,255,255,0.06)',
                      color:       done ? '#00E08C' : '#fff',
                    }}>
                    <span>{c.icon}</span>
                    <span>{posting === c.key ? 'Posting…' : done ? 'Posted' : c.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Tap one to post it as a full, courteous message.
            </p>
          </>
        )}
      </div>

      {authGate && (
        <AuthModal onClose={() => setAuthGate(false)} onSuccess={() => setAuthGate(false)} />
      )}
    </div>
  );
}

/** "in about 5 hours" / "tomorrow" — coarse on purpose, no live countdown. */
function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'in under an hour';
  if (hours === 1) return 'in about an hour';
  if (hours < 24) return `in about ${hours} hours`;
  return 'tomorrow';
}
