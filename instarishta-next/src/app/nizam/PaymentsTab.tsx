'use client';

import { useCallback, useEffect, useState } from 'react';
import { CARD, PANEL, SUBTLE, BORDER, MUTED, FAINT, GREEN_BG, GREEN, RED_BG, RED, AMBER, chip, FIELD } from './theme';

/**
 * Payments, in /nizam.
 *
 * /api/admin/orders has settled payments since 008, but only Telegram ever
 * called it — the panel had no payments surface at all. That is fine until the
 * bot is down, the admin is not in the group, or a confirmation scrolled past,
 * and then the only record of who paid what lives in a chat window.
 *
 * The two actions call the same RPCs the Telegram webhook calls, so the two
 * paths cannot disagree about what confirming means, and both append to the
 * same audit trail.
 *
 * A settled order answers 409 with its current state rather than an error, so
 * a double-click or a race with Telegram shows the admin what actually
 * happened instead of a failure.
 */

type OrderStatus = 'created' | 'pending_verification' | 'confirmed' | 'rejected' | 'expired';

type Order = {
  id: string;
  email: string;
  plan_id: string;
  amount_paise: number;
  amount: string;
  /**
   * What was bought. /api/admin/orders returns describeOrder(plan_id), which
   * is an OBJECT — this was typed as a string and rendered straight into a
   * <td>, so React threw #31 ("objects are not valid as a React child") and
   * took the whole tab down with it.
   *
   * It survived because the default filter is "Needs review", which is empty
   * on a healthy queue: the crash needed a row to render, and the one view
   * nobody opens by default was the only one that had any.
   */
  description: { label: string; detail: string };
  status: OrderStatus;
  utr: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

/** Pending first: it is the only view that needs a decision. */
const FILTERS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'pending_verification', label: 'Needs review' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'created', label: 'Unpaid' },
  { key: 'expired', label: 'Expired' },
  { key: 'all', label: 'All' },
];

const STATUS_COLOR: Record<OrderStatus, string> = {
  created: MUTED,
  pending_verification: AMBER,
  confirmed: GREEN,
  rejected: RED,
  expired: FAINT,
};

const when = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function PaymentsTab({ toast }: { toast: (m: string) => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('pending_verification');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Returns rather than sets, so a slow request for one filter cannot land on
   * top of a fast one for another — the same shape AnalyticsTab uses.
   */
  const fetchOrders = useCallback(async (): Promise<Order[] | null> => {
    const params = new URLSearchParams();
    // The route defaults to pending when the param is absent, so "all" has to
    // be said out loud rather than sent as an empty string.
    params.set('status', filter);
    if (query) params.set('q', query);
    try {
      const res = await fetch(`/api/admin/orders?${params}`);
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? 'Could not load payments'); return null; }
      return (data.orders ?? []) as Order[];
    } catch {
      toast('Could not load payments');
      return null;
    }
  }, [filter, query, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchOrders();
      if (!cancelled && next) setOrders(next);
    })();
    return () => { cancelled = true; };
  }, [fetchOrders]);

  const settle = useCallback(async (order: Order, action: 'confirm' | 'reject') => {
    // Rejecting revokes credits that were already granted, so it is not a
    // click that should be possible to make by accident.
    const note = action === 'reject'
      ? window.prompt(`Reject ${order.amount} from ${order.email}?\nReason (shown in the audit trail):`)
      : null;
    if (action === 'reject' && note === null) return;

    setBusy(order.id);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, action, note }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast(`Already ${data.order?.status ?? 'settled'} — refreshing`);
      } else if (!res.ok) {
        toast(data.error ?? 'Could not settle this payment');
      } else {
        toast(action === 'confirm' ? 'Payment confirmed' : 'Payment rejected');
      }
      const next = await fetchOrders();
      if (next) setOrders(next);
    } catch {
      toast('Could not settle this payment');
    } finally {
      setBusy(null);
    }
  }, [fetchOrders, toast]);

  const pendingTotal = (orders ?? [])
    .filter((o) => o.status === 'pending_verification')
    .reduce((s, o) => s + o.amount_paise, 0);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{
              ...chip(filter === f.key),
            }}>
            {f.label}
          </button>
        ))}
        <form style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}
          onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="email, order id or UTR"
            style={{ ...FIELD, minWidth: 190 }} />
          <button type="submit"
            style={{ fontSize: 12, padding: '5px 11px', borderRadius: 8, border: `1px solid ${BORDER}`, background: PANEL, cursor: 'pointer' }}>
            Search
          </button>
        </form>
      </div>

      {pendingTotal > 0 && (
        <div style={{ ...CARD, fontSize: 13 }}>
          <strong>₹{(pendingTotal / 100).toLocaleString('en-IN')}</strong> across{' '}
          {(orders ?? []).filter((o) => o.status === 'pending_verification').length} payment(s) waiting
          on a human. Credits for these are already granted — rejecting revokes them.
        </div>
      )}

      {orders === null ? (
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>Loading payments…</div>
      ) : orders.length === 0 ? (
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>
          Nothing here{query ? ` for “${query}”` : ''}.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: SUBTLE, textAlign: 'left' }}>
                {['Raised', 'Member', 'For', 'Amount', 'UTR', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{when(o.created_at)}</td>
                  <td style={{ padding: '8px 12px' }}>{o.email}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {o.description.label}
                    <div style={{ color: MUTED, fontSize: 11 }}>{o.description.detail}</div>
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{o.amount}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{o.utr ?? '—'}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: STATUS_COLOR[o.status] }}>
                    {o.status.replace(/_/g, ' ')}
                    {o.resolved_by && (
                      <div style={{ color: MUTED, fontSize: 11 }}>
                        by {o.resolved_by}
                      </div>
                    )}
                    {o.note && (
                      <div style={{ color: MUTED, fontSize: 11 }}>{o.note}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {o.status === 'pending_verification' && (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" disabled={busy === o.id}
                          onClick={() => void settle(o, 'confirm')}
                          style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${GREEN}`, background: GREEN_BG, color: GREEN,
                            opacity: busy === o.id ? 0.5 : 1,
                          }}>
                          Confirm
                        </button>
                        <button type="button" disabled={busy === o.id}
                          onClick={() => void settle(o, 'reject')}
                          style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${BORDER}`, background: RED_BG, color: RED,
                            opacity: busy === o.id ? 0.5 : 1,
                          }}>
                          Reject
                        </button>
                      </span>
                    )}
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
