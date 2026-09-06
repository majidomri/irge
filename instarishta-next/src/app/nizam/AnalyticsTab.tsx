'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SOURCE_LABEL, type TrafficSource } from '@/lib/traffic-source';

/**
 * Per-listing analytics for /nizam.
 *
 * Live rather than polled. ir_profile_events is in the supabase_realtime
 * publication, so an insert reaches this tab as a postgres_changes event and
 * the totals move while an admin is watching. The subscription only signals
 * that something arrived — the numbers are then refetched through
 * /api/admin/profile-stats, because that route is admin-gated and does the
 * aggregation. Subscribing directly to the rows would mean giving the browser
 * read access to the whole audience of every listing, which is exactly what
 * the RLS policy on that table refuses.
 *
 * Refetches are coalesced: a feed scroll inserts a burst of impressions, and
 * one request per row would turn a dashboard into a load test.
 */

type SourceRow = { source: string; label: string; count: number };
type Listing = {
  entityId: string;
  entityType: string;
  total: number;
  reach: number;
  topSource: string;
  view?: number;
  impression?: number;
  click?: number;
  share?: number;
  listen?: number;
  contact?: number;
};

type Stats = {
  days: number;
  totals: Record<string, number>;
  sources: SourceRow[];
  listings?: Listing[];
  countries?: Record<string, number>;
  devices?: Record<string, number>;
  byDay?: [string, number][];
  note?: string;
};

const EVENTS = ['impression', 'view', 'click', 'listen', 'contact', 'share'] as const;

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E8E4E0',
  borderRadius: 12,
  padding: 14,
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#141413' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#767676', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function AnalyticsTab({ toast }: { toast: (m: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(0);

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetch without touching state, so the caller decides whether the answer is
   * still wanted. A slow request for 90 days must not overwrite a fast one for
   * 7 just because it landed second.
   */
  const fetchStats = useCallback(async (): Promise<Stats | null> => {
    try {
      const qs = new URLSearchParams({ days: String(days) });
      if (entityId) qs.set('entityId', entityId);
      const res = await fetch(`/api/admin/profile-stats?${qs}`);
      if (!res.ok) { toast('Could not load analytics'); return null; }
      return (await res.json()) as Stats;
    } catch {
      toast('Could not load analytics');
      return null;
    }
  }, [days, entityId, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchStats();
      if (!cancelled && next) setStats(next);
    })();
    return () => { cancelled = true; };
  }, [fetchStats]);

  /** Used by the realtime handler, where a late answer is still the newest. */
  const load = useCallback(async () => {
    const next = await fetchStats();
    if (next) setStats(next);
  }, [fetchStats]);

  // Live updates. Coalesced at 1.5s so a burst of impressions is one refetch.
  useEffect(() => {
    let cancelled = false;
    let client: { removeChannel: (c: unknown) => void; channel: (n: string) => unknown } | null = null;
    let channel: unknown = null;

    (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      if (cancelled) return;

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      const sb = createClient(url, key, { auth: { persistSession: false } });
      client = sb as unknown as typeof client;

      channel = sb
        .channel('nizam:profile-events')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ir_profile_events' },
          () => {
            setPulse((n) => n + 1);
            if (pending.current) return;
            pending.current = setTimeout(() => {
              pending.current = null;
              void load();
            }, 1500);
          })
        .subscribe((status: string) => setLive(status === 'SUBSCRIBED'));

      // Unmount can land between the check above and this line, and the
      // cleanup below has already run by then — it had no channel to remove.
      // Checking again here is what stops the subscription outliving the tab.
      if (cancelled) {
        sb.removeChannel(channel as Parameters<typeof sb.removeChannel>[0]);
        channel = null;
      }
    })();

    return () => {
      cancelled = true;
      if (pending.current) clearTimeout(pending.current);
      if (client && channel) client.removeChannel(channel);
      setLive(false);
    };
  }, [load]);

  const totals = stats?.totals ?? {};

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>
          {entityId ? `Rishta ${entityId}` : 'All listings'}
        </strong>

        <span style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 999,
          background: live ? 'rgba(0,168,107,0.12)' : 'rgba(0,0,0,0.06)',
          color: live ? '#006241' : '#767676',
        }}>
          {live ? `● live${pulse ? ` · ${pulse} in` : ''}` : '○ connecting'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              style={{
                fontSize: 12, padding: '5px 11px', borderRadius: 999,
                border: '1px solid #E8E4E0', cursor: 'pointer',
                background: days === d ? '#006241' : '#fff',
                color: days === d ? '#fff' : '#141413',
              }}>{d}d</button>
          ))}
          {entityId && (
            <button type="button" onClick={() => setEntityId(null)}
              style={{ fontSize: 12, padding: '5px 11px', borderRadius: 999, border: '1px solid #E8E4E0', background: '#fff', cursor: 'pointer' }}>
              ← all
            </button>
          )}
        </div>
      </div>

      {stats?.note && (
        <div style={{ ...CARD, color: '#767676', fontSize: 13 }}>{stats.note}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
        <Stat label="People reached" value={totals.reach ?? 0} />
        {EVENTS.map((e) => <Stat key={e} label={e} value={totals[e] ?? 0} />)}
      </div>

      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Where they came from</div>
        {(stats?.sources ?? []).length === 0 && (
          <div style={{ fontSize: 12, color: '#767676' }}>Nothing yet.</div>
        )}
        {(stats?.sources ?? []).map((s) => {
          const max = stats?.sources?.[0]?.count || 1;
          return (
            <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 140, fontSize: 12 }}>
                {SOURCE_LABEL[s.source as TrafficSource] ?? s.label}
              </div>
              <div style={{ flex: 1, height: 8, background: '#F2F0EB', borderRadius: 999 }}>
                <div style={{
                  width: `${Math.max(3, (s.count / max) * 100)}%`,
                  height: '100%', borderRadius: 999,
                  background: s.source === 'llm' ? '#00A86B' : '#617285',
                }} />
              </div>
              <div style={{ width: 46, textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {s.count}
              </div>
            </div>
          );
        })}
      </div>

      {stats?.listings && stats.listings.length > 0 && (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#FAFAF9', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>Listing</th>
                <th style={{ padding: 10 }}>Reach</th>
                {EVENTS.map((e) => <th key={e} style={{ padding: 10 }}>{e}</th>)}
                <th style={{ padding: 10 }}>Top source</th>
              </tr>
            </thead>
            <tbody>
              {stats.listings.map((l) => (
                <tr key={l.entityId} style={{ borderTop: '1px solid #F0EDE9' }}>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => setEntityId(l.entityId)}
                      style={{ background: 'none', border: 'none', color: '#006241', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                      {l.entityType} {l.entityId}
                    </button>
                  </td>
                  <td style={{ padding: 10 }}>{l.reach}</td>
                  {EVENTS.map((e) => <td key={e} style={{ padding: 10 }}>{l[e] ?? 0}</td>)}
                  <td style={{ padding: 10 }}>
                    {SOURCE_LABEL[l.topSource as TrafficSource] ?? l.topSource}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entityId && stats?.byDay && stats.byDay.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>By day</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 70 }}>
            {stats.byDay.map(([day, n]) => {
              const max = Math.max(...stats.byDay!.map(([, v]) => v)) || 1;
              return (
                <div key={day} title={`${day}: ${n}`}
                  style={{ flex: 1, height: `${(n / max) * 100}%`, minHeight: 2, background: '#00A86B', borderRadius: 2 }} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
