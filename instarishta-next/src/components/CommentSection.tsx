'use client';
import { useEffect, useState } from 'react';
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

/**
 * Public comment thread + chip picker for a channel post or story.
 *
 * Unlike the private /profiles interest chips, these ARE shown publicly —
 * so posting requires a signed-in, bannable account (see /api/comments),
 * and the vocabulary stays fixed (no free text) to keep the harassment
 * surface as small as it can be while still being public.
 *
 * Embedded both inline (full /post/[slug] page) and inside a bottom-sheet
 * drawer over the in-feed post viewer — this component owns no page chrome
 * so it works in either shell.
 */
export default function CommentSection({
  entityType, entityId, initialComments, initialCount,
}: {
  entityType: 'post' | 'story';
  entityId: string;
  initialComments?: CommentItem[];
  initialCount?: number;
}) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments ?? []);
  const [count, setCount]       = useState(initialCount ?? initialComments?.length ?? 0);
  const [loading, setLoading]   = useState(initialComments === undefined);
  const [posted, setPosted]     = useState<Set<string>>(new Set());
  const [posting, setPosting]   = useState<string | null>(null);
  const [error, setError]       = useState('');
  const [authGate, setAuthGate] = useState(false);

  useEffect(() => {
    if (initialComments !== undefined) return;
    (async () => {
      try {
        const res = await fetch(`/api/comments?entityType=${entityType}&entityId=${entityId}`);
        const data = await res.json();
        setComments(data.comments ?? []);
        setCount(data.count ?? 0);
      } finally {
        setLoading(false);
      }
    })();
    // Only ever runs for the entity this component was mounted for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      } else {
        setError(data.error || 'Could not post — please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPosting(null);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: '#A0A0A0' }}>
        {count} {count === 1 ? 'comment' : 'comments'}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {COMMENT_CHIPS.map(c => {
          const done = posted.has(c.key);
          return (
            <button key={c.key} type="button" disabled={posting !== null || done}
              onClick={() => submit(c.key)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold border-2 disabled:opacity-60"
              style={{
                borderColor: done ? '#006241' : '#E8E4E0',
                background:  done ? '#EEF6F0' : '#FAFAF9',
                color:       done ? '#006241' : '#141413',
              }}>
              <span>{c.icon}</span>
              <span>{posting === c.key ? 'Posting…' : done ? 'Posted' : c.label}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs font-semibold mb-3" style={{ color: '#CF4500' }}>{error}</p>}

      {loading ? (
        <p className="text-xs" style={{ color: '#A0A0A0' }}>Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs" style={{ color: '#A0A0A0' }}>No comments yet — be the first.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {comments.map(c => {
            const chip = COMMENT_CHIPS.find(k => k.key === c.chip_key);
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                <span className="text-base leading-none shrink-0 mt-0.5">{chip?.icon ?? '💬'}</span>
                <p className="text-sm leading-snug">
                  <span className="font-bold" style={{ color: '#141413' }}>{c.author_name}</span>{' '}
                  <span style={{ color: '#4B4B4B' }}>{chip?.label ?? c.chip_key}</span>{' '}
                  <span className="text-[11px]" style={{ color: '#B0A8A0' }}>· {timeAgo(c.created_at)}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {authGate && (
        <AuthModal onClose={() => setAuthGate(false)} onSuccess={() => setAuthGate(false)} />
      )}
    </div>
  );
}
