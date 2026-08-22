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
    <div style={{ background: '#141413', color: '#fff', borderRadius: 16 }} className="p-4">
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

      <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Suggested
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {COMMENT_CHIPS.map(c => {
          const done = posted.has(c.key);
          return (
            <button key={c.key} type="button" disabled={posting !== null || done}
              onClick={() => submit(c.key)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold border disabled:opacity-60"
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

      {error && <p className="text-xs font-semibold mb-3" style={{ color: '#FF8B5A' }}>{error}</p>}

      {loading ? (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading comments…</p>
      ) : comments.length > 0 && (
        <div className="flex flex-col gap-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {comments.map(c => {
            const chip = COMMENT_CHIPS.find(k => k.key === c.chip_key);
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'rgba(0,168,107,0.18)', color: '#00E08C' }}>
                  {initialOf(c.author_name)}
                </div>
                <p className="text-sm leading-snug pt-1">
                  <span className="font-bold text-white">{c.author_name}</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>{chip?.icon} {chip?.label ?? c.chip_key}</span>{' '}
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>· {timeAgo(c.created_at)}</span>
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
