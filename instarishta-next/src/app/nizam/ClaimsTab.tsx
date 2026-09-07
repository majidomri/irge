'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Listing ownership review.
 *
 * A claim whose phone matches the ad never reaches this queue — it is approved
 * by /api/account/claims on submission. What is here could not prove itself,
 * so approving is a judgement, and it is consequential: it opens one listing's
 * audience to one account until somebody revokes it.
 *
 * The claimed number is shown next to little else on purpose. Deciding needs
 * the member's verified number and the listing number; everything else about
 * them is one click away in their full record.
 */

type Claim = {
  id: string;
  profile_num: number;
  user_id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  proof: string | null;
  claimed_phone: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reason: string | null;
  created_at: string;
};

const FILTERS: { key: Claim['status'] | 'all'; label: string }[] = [
  { key: 'pending', label: 'Needs review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'revoked', label: 'Revoked' },
  { key: 'all', label: 'All' },
];

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E8E4E0', borderRadius: 12, padding: 14,
};

const when = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function ClaimsTab({ toast }: { toast: (m: string) => void }) {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [filter, setFilter] = useState<Claim['status'] | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);

  const fetchClaims = useCallback(async (): Promise<Claim[] | null> => {
    try {
      const res = await fetch(`/api/admin/claims?status=${filter}`);
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? 'Could not load claims'); return null; }
      return (data.claims ?? []) as Claim[];
    } catch {
      toast('Could not load claims');
      return null;
    }
  }, [filter, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchClaims();
      if (!cancelled && next) setClaims(next);
    })();
    return () => { cancelled = true; };
  }, [fetchClaims]);

  const act = useCallback(async (claim: Claim, action: 'approve' | 'reject' | 'revoke') => {
    // Approving hands over an audience; rejecting and revoking take one away.
    // All three deserve a sentence in the audit trail.
    const reason = window.prompt(
      `${action} listing #${claim.profile_num} for ${claim.email}?\nReason (kept in the audit trail):`,
    );
    if (reason === null) return;

    setBusy(claim.id);
    try {
      const res = await fetch('/api/admin/claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: claim.id, action, reason }),
      });
      const data = await res.json();
      toast(res.ok ? `Claim ${action}d` : (data.error ?? 'Could not update this claim'));
      const next = await fetchClaims();
      if (next) setClaims(next);
    } catch {
      toast('Could not update this claim');
    } finally {
      setBusy(null);
    }
  }, [fetchClaims, toast]);

  const btn = (bg: string, fg: string, border: string): React.CSSProperties => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${border}`, background: bg, color: fg,
  });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{
              fontSize: 12, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid ' + (filter === f.key ? '#141413' : '#E8E4E0'),
              background: filter === f.key ? '#141413' : '#fff',
              color: filter === f.key ? '#F3F0EE' : '#141413',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ ...CARD, fontSize: 12, color: '#767676' }}>
        Approving opens that listing&apos;s audience numbers to this member&apos;s account, and only
        one account can own a listing. Claims whose verified mobile already matches the number
        printed on the ad are approved automatically and never appear here.
      </div>

      {claims === null ? (
        <div style={{ ...CARD, fontSize: 13, color: '#767676' }}>Loading claims…</div>
      ) : claims.length === 0 ? (
        <div style={{ ...CARD, fontSize: 13, color: '#767676' }}>Nothing here.</div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#FAFAF9', textAlign: 'left' }}>
                {['Filed', 'Listing', 'Member', 'Their verified number', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #F5F2EF' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{when(c.created_at)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>#{c.profile_num}</td>
                  <td style={{ padding: '8px 12px' }}>{c.email}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                    {c.claimed_phone ?? <span style={{ color: '#B45309' }}>none verified</span>}
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {c.status}
                    {c.proof && <div style={{ color: '#767676', fontSize: 11 }}>{c.proof}</div>}
                    {c.reviewed_by && <div style={{ color: '#767676', fontSize: 11 }}>by {c.reviewed_by}</div>}
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      {c.status !== 'approved' && (
                        <button type="button" disabled={busy === c.id}
                          onClick={() => void act(c, 'approve')}
                          style={{ ...btn('#15803D', '#fff', '#15803D'), opacity: busy === c.id ? 0.5 : 1 }}>
                          Approve
                        </button>
                      )}
                      {c.status === 'pending' && (
                        <button type="button" disabled={busy === c.id}
                          onClick={() => void act(c, 'reject')}
                          style={{ ...btn('#fff', '#B91C1C', '#E8E4E0'), opacity: busy === c.id ? 0.5 : 1 }}>
                          Reject
                        </button>
                      )}
                      {c.status === 'approved' && (
                        <button type="button" disabled={busy === c.id}
                          onClick={() => void act(c, 'revoke')}
                          style={{ ...btn('#fff', '#B91C1C', '#E8E4E0'), opacity: busy === c.id ? 0.5 : 1 }}>
                          Revoke
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
