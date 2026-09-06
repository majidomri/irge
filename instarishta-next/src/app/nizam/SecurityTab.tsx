'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Security: the edge firewall's denylist, and member moderation.
 *
 * One tab because they answer the same question from two directions. An
 * address hammering the site and a member abusing it are the same incident
 * seen through different lenses, and an admin dealing with one usually needs
 * the other in front of them.
 *
 * Every destructive control here states its consequence before it is used.
 * Blocking signs someone out of every device immediately, which is not
 * recoverable by undo — so the button says so, and the reason field is
 * required rather than optional.
 */

const GREEN = '#00A86B';
const RED = '#CF4500';
const PANEL = 'rgba(255,255,255,0.04)';
const BORDER = '1px solid rgba(255,255,255,0.10)';

type BlockedIp = {
  id: string;
  pattern: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
};

type SecurityEvent = {
  id: number;
  kind: string;
  reason: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  method: string | null;
  path: string | null;
  created_at: string;
};

type MemberLookup = {
  email: string;
  hasAccount: boolean;
  profile: {
    id: string; email: string; full_name: string | null;
    plan: string | null; is_banned: boolean | null; created_at: string;
  } | null;
  block: { reason: string; blocked_by: string; blocked_at: string; unblocked_at: string | null } | null;
  sessions: { id: string; createdAt: string; ipAddress: string | null; userAgent: string | null }[];
  posts: { id: string; title: string | null; caption: string | null; created_at: string }[];
  reportsBy: { id: string; category: string; description: string | null; status: string; created_at: string }[];
  history: { action: string; reason: string | null; actor: string; created_at: string }[];
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function SecurityTab({ toast }: { toast: (msg: string) => void }) {
  const [ips, setIps] = useState<BlockedIp[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [newIp, setNewIp] = useState('');
  const [newIpReason, setNewIpReason] = useState('');

  const [lookupEmail, setLookupEmail] = useState('');
  const [member, setMember] = useState<MemberLookup | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [hideListings, setHideListings] = useState(false);

  const loadFirewall = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/firewall-admin', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIps(data.blocked ?? []);
        setEvents(data.events ?? []);
      }
    } catch {
      toast('Could not load firewall data');
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { void loadFirewall(); }, [loadFirewall]);

  const addIp = async () => {
    const pattern = newIp.trim();
    if (!pattern || !newIpReason.trim()) {
      toast('Address and reason are both required');
      return;
    }
    const res = await fetch('/api/admin/firewall-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, reason: newIpReason.trim() }),
    });
    if (res.ok) {
      setNewIp(''); setNewIpReason('');
      toast('Address blocked — active within a minute');
      void loadFirewall();
    } else {
      toast((await res.json()).error ?? 'Block failed');
    }
  };

  const removeIp = async (pattern: string) => {
    const res = await fetch('/api/admin/firewall-admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern }),
    });
    if (res.ok) { toast('Address unblocked'); void loadFirewall(); }
    else toast('Unblock failed');
  };

  const lookup = async () => {
    const email = lookupEmail.trim().toLowerCase();
    if (!email.includes('@')) { toast('Enter an email address'); return; }

    setMemberBusy(true);
    try {
      const res = await fetch(`/api/admin/moderation?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
      if (res.ok) setMember(await res.json());
      else toast('Lookup failed');
    } catch {
      toast('Lookup failed');
    }
    setMemberBusy(false);
  };

  const moderate = async (action: 'block' | 'unblock') => {
    if (!member) return;
    if (!blockReason.trim()) { toast('A reason is required'); return; }

    setMemberBusy(true);
    const res = await fetch('/api/admin/moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        email: member.email,
        reason: blockReason.trim(),
        hideListings: action === 'block' ? hideListings : undefined,
      }),
    });
    const data = await res.json();
    setMemberBusy(false);

    if (!res.ok) { toast(data.error ?? 'Action failed'); return; }

    toast(
      action === 'block'
        ? `Blocked · ${data.sessionsRevoked} session(s) ended` +
          (data.listingsHidden ? ` · ${data.listingsHidden} listing(s) hidden` : '') +
          (data.note ? ` · ${data.note}` : '')
        : 'Unblocked',
    );
    setBlockReason('');
    void lookup();
  };

  const hideOne = async (entityId: string, currentlyHidden: boolean) => {
    const reason = blockReason.trim() || 'Hidden from the security tab';
    const res = await fetch('/api/admin/moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: currentlyHidden ? 'unhide' : 'hide',
        entityType: 'post',
        entityId,
        reason,
      }),
    });
    if (res.ok) { toast(currentlyHidden ? 'Listing restored' : 'Listing hidden'); void lookup(); }
    else toast('Failed');
  };

  const isBlocked = Boolean(member?.block && !member.block.unblocked_at);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Member moderation ─────────────────────────────────────────── */}
      <section style={{ background: PANEL, border: BORDER, borderRadius: 12, padding: 16 }}>
        <h2 className="text-sm font-bold mb-1" style={{ color: '#fff' }}>Member moderation</h2>
        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Look someone up by the email they signed in with. Email is the only
          identifier shared by the accounts table and the session store.
        </p>

        <div className="flex gap-2 flex-wrap">
          <input
            value={lookupEmail}
            onChange={e => setLookupEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void lookup(); }}
            placeholder="member@example.com"
            aria-label="Member email"
            className="flex-1 min-w-[220px] rounded-lg px-3 py-2 text-sm"
            style={{ background: 'rgba(0,0,0,0.3)', border: BORDER, color: '#fff' }}
          />
          <button
            onClick={() => void lookup()}
            disabled={memberBusy}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: GREEN, color: '#0B0B0A', opacity: memberBusy ? 0.6 : 1 }}
          >
            {memberBusy ? 'Working…' : 'Look up'}
          </button>
        </div>

        {member && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
              <span><strong style={{ color: '#fff' }}>{member.profile?.full_name ?? '—'}</strong> · {member.email}</span>
              <span>Account: {member.hasAccount ? 'yes' : 'no sign-in record'}</span>
              <span>Plan: {member.profile?.plan ?? 'none'}</span>
              <span style={{ color: isBlocked ? RED : GREEN }}>
                {isBlocked ? 'BLOCKED' : 'Active'}
              </span>
              <span>Live sessions: {member.sessions.length}</span>
            </div>

            {isBlocked && member.block && (
              <p className="text-xs" style={{ color: RED }}>
                Blocked by {member.block.blocked_by} on {shortDate(member.block.blocked_at)} — {member.block.reason}
              </p>
            )}

            {/* What they did */}
            <div className="grid gap-4 md:grid-cols-3">
              <Panel title={`Listings (${member.posts.length})`}>
                {member.posts.length === 0
                  ? <Empty>Nothing published.</Empty>
                  : member.posts.slice(0, 12).map(p => (
                      <Row key={p.id}>
                        <span className="truncate" dir="auto">{p.title ?? '(untitled)'}</span>
                        <button
                          onClick={() => void hideOne(p.id, false)}
                          className="text-[11px] font-semibold shrink-0"
                          style={{ color: RED }}
                        >
                          hide
                        </button>
                      </Row>
                    ))}
              </Panel>

              <Panel title={`Sessions (${member.sessions.length})`}>
                {member.sessions.length === 0
                  ? <Empty>No active sessions.</Empty>
                  : member.sessions.slice(0, 12).map(s => (
                      <Row key={s.id}>
                        <span className="truncate">{s.ipAddress ?? 'unknown IP'}</span>
                        <span className="shrink-0 opacity-60">{shortDate(s.createdAt)}</span>
                      </Row>
                    ))}
              </Panel>

              <Panel title={`Moderation history (${member.history.length})`}>
                {member.history.length === 0
                  ? <Empty>No prior actions.</Empty>
                  : member.history.slice(0, 12).map((h, i) => (
                      <Row key={i}>
                        <span className="truncate">{h.action} — {h.reason ?? ''}</span>
                        <span className="shrink-0 opacity-60">{shortDate(h.created_at)}</span>
                      </Row>
                    ))}
              </Panel>
            </div>

            {/* Act */}
            <div className="flex flex-col gap-2" style={{ borderTop: BORDER, paddingTop: 12 }}>
              <input
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="Reason (required — this is the record)"
                aria-label="Moderation reason"
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'rgba(0,0,0,0.3)', border: BORDER, color: '#fff' }}
              />

              {!isBlocked && (
                <label className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  <input
                    type="checkbox"
                    checked={hideListings}
                    onChange={e => setHideListings(e.target.checked)}
                  />
                  Also hide their listings from /profiles and the feeds
                  <span className="opacity-60">(kept in the records for investigation)</span>
                </label>
              )}

              <div className="flex gap-2 flex-wrap">
                {isBlocked ? (
                  <button
                    onClick={() => void moderate('unblock')}
                    disabled={memberBusy}
                    className="rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ background: GREEN, color: '#0B0B0A' }}
                  >
                    Unblock
                  </button>
                ) : (
                  <button
                    onClick={() => void moderate('block')}
                    disabled={memberBusy}
                    className="rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ background: RED, color: '#fff' }}
                  >
                    Block &amp; sign out of all devices
                  </button>
                )}
              </div>

              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Blocking ends every session immediately — they are signed out on
                every device. Content is never deleted: hiding is reversible and
                the rows stay for investigation.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── IP denylist ────────────────────────────────────────────────── */}
      <section style={{ background: PANEL, border: BORDER, borderRadius: 12, padding: 16 }}>
        <h2 className="text-sm font-bold mb-1" style={{ color: '#fff' }}>Blocked addresses</h2>
        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
          An exact address, or a prefix ending in a dot (203.0.113.) to block a
          range. The edge picks changes up within a minute.
        </p>

        <div className="flex gap-2 flex-wrap mb-3">
          <input
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            placeholder="203.0.113.7 or 203.0.113."
            aria-label="Address or prefix"
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'rgba(0,0,0,0.3)', border: BORDER, color: '#fff', minWidth: 200 }}
          />
          <input
            value={newIpReason}
            onChange={e => setNewIpReason(e.target.value)}
            placeholder="Reason (required)"
            aria-label="Block reason"
            className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm"
            style={{ background: 'rgba(0,0,0,0.3)', border: BORDER, color: '#fff' }}
          />
          <button
            onClick={() => void addIp()}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: RED, color: '#fff' }}
          >
            Block
          </button>
        </div>

        {loading ? <Empty>Loading…</Empty> : ips.length === 0 ? (
          <Empty>Nothing blocked.</Empty>
        ) : (
          <div className="flex flex-col">
            {ips.map(row => (
              <Row key={row.id}>
                <span className="truncate">
                  <strong style={{ color: '#fff' }}>{row.pattern}</strong>
                  {row.reason ? ` — ${row.reason}` : ''}
                </span>
                <button
                  onClick={() => void removeIp(row.pattern)}
                  className="text-[11px] font-semibold shrink-0"
                  style={{ color: GREEN }}
                >
                  unblock
                </button>
              </Row>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent firewall activity ───────────────────────────────────── */}
      <section style={{ background: PANEL, border: BORDER, borderRadius: 12, padding: 16 }}>
        <h2 className="text-sm font-bold mb-1" style={{ color: '#fff' }}>Recent firewall activity</h2>
        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Only blocks and rate-limit trips are recorded — not ordinary traffic.
        </p>

        {events.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <div className="flex flex-col">
            {events.slice(0, 60).map(e => (
              <Row key={e.id}>
                <span className="truncate">
                  <strong style={{ color: e.kind === 'rate-limited' ? '#E8B54A' : RED }}>{e.kind}</strong>
                  {' '}{e.reason} · {e.ip ?? '—'}
                  {e.country ? ` · ${e.country}${e.city ? '/' + e.city : ''}` : ''}
                  {e.device ? ` · ${e.device}` : ''}
                  {e.path ? ` · ${e.method} ${e.path}` : ''}
                </span>
                <span className="shrink-0 opacity-60">{shortDate(e.created_at)}</span>
              </Row>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', border: BORDER, borderRadius: 10, padding: 12 }}>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {title}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5 text-xs"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{children}</p>;
}
