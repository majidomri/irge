'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import { commentChipIcon, commentChipLabel } from '@/lib/comment-chips';
import { actorSummary, type NotificationBundle } from '@/lib/notifications';

// The route returns bundled lines, not raw rows — see bundleNotifications().
type NotificationItem = NotificationBundle;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const POLL_MS = 45_000;

/**
 * Bell icon + dropdown inbox for the comment_received / comment_acknowledged
 * events (see lib/notifications.ts) — the InstaRishta analogue of
 * IndiaNikah's proposal notification bell. Polling, not push: a v1 that
 * matches their in-app behaviour without the added complexity of a service
 * worker + VAPID keys, which is a reasonable next step rather than a launch
 * requirement.
 */
export default function NotificationBell() {
  const { data: session } = useSession();
  const [open, setOpen]           = useState(false);
  const [items, setItems]         = useState<NotificationItem[]>([]);
  const [unread, setUnread]       = useState(0);
  const [acking, setAcking]       = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch('/api/notifications');
    // An unchecked failure emptied the bell, which reads as "all caught up".
    if (!res.ok) { console.error('[notifications] load failed:', res.status); return; }
    const data = await res.json().catch(() => ({}));
    setItems(data.notifications ?? []);
    setUnread(data.unreadCount ?? 0);
  };

  useEffect(() => {
    if (!session?.user) return;
    queueMicrotask(load);
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems(list => list.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
      }).catch(() => {});
    }
  };

  // Acknowledging a bundle acknowledges its newest comment — that is the one
  // the member is looking at, and the acknowledged event is addressed to a
  // specific commenter, so it cannot be fanned out across the whole bundle.
  const acknowledge = async (bundle: NotificationItem) => {
    setAcking(bundle.key);
    try {
      const res = await fetch(`/api/notifications/${bundle.latestId}/acknowledge`, { method: 'POST' });
      if (res.ok) {
        setItems(list => list.map(n => (n.key === bundle.key ? { ...n, responded_at: new Date().toISOString() } : n)));
      }
    } finally {
      setAcking(null);
    }
  };

  if (!session?.user) return null;

  return (
    <div ref={rootRef} className="relative">
      <button onClick={toggleOpen} aria-label="Notifications"
        className="relative w-8 h-8 flex items-center justify-center rounded-full border-0 cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.10)', color: '#fff' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: '#EA4335', color: '#fff' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl overflow-hidden z-[200]"
          style={{ background: '#fff', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', border: '1px solid #F0ECE8' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #F0ECE8' }}>
            <p className="text-sm font-extrabold" style={{ color: '#141413' }}>Notifications</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: '#A0A0A0' }}>Nothing yet.</p>
            ) : (
              items.map(n => {
                const icon  = commentChipIcon(n.chip_key);
                const label = commentChipLabel(n.chip_key);
                const who   = actorSummary(n.actors);
                const place = n.entity_type === 'story' ? 'story' : 'post';

                // One line stands in for the whole bundle. The count is kept
                // visible rather than folded away — "and 4 others" without a
                // number reads as vaguer than what actually happened.
                const body = n.type === 'comment_received'
                  ? (n.count > 1
                      ? <><strong>{who}</strong> left {n.count} comments on your {place}</>
                      : <><strong>{who}</strong> commented <strong>{label}</strong> on your {place}</>)
                  : <><strong>{who}</strong> acknowledged your comment</>;

                const row = (
                  <div className="flex items-start gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid #F7F5F3' }}>
                    <span className="text-base leading-none shrink-0 mt-0.5">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug" style={{ color: '#141413' }}>{body}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#A0A0A0' }}>{timeAgo(n.created_at)}</p>
                      {n.type === 'comment_received' && !n.responded_at && (
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); acknowledge(n); }}
                          disabled={acking === n.key}
                          className="mt-2 rounded-full px-3 py-1 text-[11px] font-bold disabled:opacity-50"
                          style={{ background: '#EEF6F0', color: '#006241' }}>
                          {acking === n.key ? 'Acknowledging…' : 'Acknowledge'}
                        </button>
                      )}
                      {n.type === 'comment_received' && n.responded_at && (
                        <p className="mt-1 text-[10px] font-bold" style={{ color: '#006241' }}>✓ Acknowledged</p>
                      )}
                    </div>
                  </div>
                );

                return n.slug ? (
                  <Link key={n.key} href={`/p/${n.slug}`} className="block no-underline" style={{ color: 'inherit' }}>
                    {row}
                  </Link>
                ) : (
                  <div key={n.key}>{row}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
