'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * One member, everything at once.
 *
 * The actions for a member already existed and were spread across four tabs;
 * what was missing was the view. Answering "this person says a credit went
 * missing" meant opening Users, Orders, Interests and Security and joining
 * them by eye.
 *
 * Reads from /api/admin/users/[id], which is deliberately read-only. Mutations
 * stay in the routes that already own them and already write to
 * ir_moderation_actions — a panel that could change things four different ways
 * is how an audit trail stops being true.
 */

type Summary = {
  credits: { cycle: number; bonus: number };
  plan: string;
  banned: boolean;
  ordersTotal: number;
  paidPaise: number;
  interestsSent: number;
  commentsPosted: number;
  contactsUnlocked: number;
  repliesReceived: number;
  storiesWatched: number;
  unreadNotifications: number;
  usageByFeature: Record<string, number>;
};

type Content = {
  posts: number; stories: number; views: number; likes: number;
};

type Row = Record<string, unknown>;

type Detail = {
  profile: Row;
  summary: Summary;
  orders: Row[];
  interests: Row[];
  comments: Row[];
  notifications: Row[];
  moderation: Row[];
  content: Content | null;
  failed: string[];
};

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E8E4E0', borderRadius: 12, padding: 14,
};

const rupees = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
const when = (v: unknown) =>
  typeof v === 'string' ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function Section({ title, rows, cols }: { title: string; rows: Row[]; cols: string[] }) {
  return (
    <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid #F0EDE9' }}>
        {title} <span style={{ color: '#767676', fontWeight: 400 }}>({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 14, fontSize: 12, color: '#767676' }}>Nothing yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#FAFAF9', textAlign: 'left' }}>
              {cols.map((c) => <th key={c} style={{ padding: '8px 12px', fontWeight: 600 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #F5F2EF' }}>
                {cols.map((c) => (
                  <td key={c} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {c.includes('_at') ? when(r[c])
                      : c === 'amount_paise' ? rupees(Number(r[c] ?? 0))
                      : String(r[c] ?? '—').slice(0, 60)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function UserDetail({
  userId,
  onClose,
  toast,
}: {
  userId: string;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);

  const fetchDetail = useCallback(async (): Promise<Detail | null> => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`);
      if (!res.ok) { toast('Could not load this member'); return null; }
      return (await res.json()) as Detail;
    } catch {
      toast('Could not load this member');
      return null;
    }
  }, [userId, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchDetail();
      if (!cancelled && next) setData(next);
    })();
    return () => { cancelled = true; };
  }, [fetchDetail]);

  if (!data) {
    return <div style={{ ...CARD, fontSize: 13, color: '#767676' }}>Loading member…</div>;
  }

  const p = data.profile as { email?: string; full_name?: string; created_at?: string };
  const s = data.summary;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose}
          style={{ fontSize: 12, padding: '5px 11px', borderRadius: 999, border: '1px solid #E8E4E0', background: '#fff', cursor: 'pointer' }}>
          ← all users
        </button>
        <strong style={{ fontSize: 15 }}>{p.full_name || p.email}</strong>
        <span style={{ fontSize: 12, color: '#767676' }}>{p.email}</span>
        {s.banned && (
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'rgba(200,0,0,0.1)', color: '#a00' }}>
            blocked
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#767676' }}>
          joined {when(p.created_at)}
        </span>
      </div>

      {data.failed.length > 0 && (
        <div style={{ ...CARD, fontSize: 12, color: '#a00' }}>
          Could not load: {data.failed.join(', ')}. Those sections are empty because the
          query failed, not because there is nothing there.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
        {[
          ['Plan', s.plan],
          ['Cycle credits', s.credits.cycle],
          ['Bonus credits', s.credits.bonus],
          ['Paid', rupees(s.paidPaise)],
          ['Orders', s.ordersTotal],
          ['Interests', s.interestsSent],
          ['Comments', s.commentsPosted],
          ['Contacts unlocked', s.contactsUnlocked],
          ['Replies received', s.repliesReceived],
          ['Stories watched', s.storiesWatched],
          ['Unread alerts', s.unreadNotifications],
          ['Voice notes heard', s.usageByFeature.audio ?? 0],
          ['Profiles opened', s.usageByFeature.view ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} style={CARD}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{String(value)}</div>
            <div style={{ fontSize: 12, color: '#767676', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.content && (
        <div style={{ ...CARD, fontSize: 13 }}>
          <strong>Content attributed to this account</strong>
          <div style={{ marginTop: 6, color: '#767676' }}>
            {data.content.posts} post(s), {data.content.stories} story/stories ·{' '}
            {data.content.views} views · {data.content.likes} likes
          </div>
        </div>
      )}

      <Section title="Payments" rows={data.orders}
        cols={['created_at', 'plan_id', 'amount_paise', 'status', 'utr', 'resolved_by']} />
      <Section title="Interests sent" rows={data.interests}
        cols={['created_at', 'profile_num', 'profile_title', 'status', 'revealed_at']} />
      <Section title="Comments" rows={data.comments}
        cols={['created_at', 'entity_type', 'entity_id', 'author_name', 'hidden']} />
      <Section title="Notifications" rows={data.notifications}
        cols={['created_at', 'type', 'actor_name', 'read_at']} />
      <Section title="Moderation history" rows={data.moderation}
        cols={['created_at', 'action', 'actor', 'reason']} />
    </div>
  );
}
