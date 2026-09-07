'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Field Core Web Vitals, in /nizam.
 *
 * Lighthouse CI already runs nightly and says what one machine on one network
 * did. This says what visitors on their own phones actually got, which is the
 * number Google assesses the site on. The two disagree often, and when they do
 * this one is right.
 *
 * p75 throughout, because that is how the thresholds are defined — a mean
 * hides the one slow phone in ten that the assessment is about.
 *
 * Worst paths are shown next to each metric: "INP is 240ms" is not something
 * anyone can act on, and "INP is 240ms on /channels/[slug]" is.
 */

type PathRow = { path: string; p75: number; samples: number };
type Metric = {
  name: string;
  p75: number;
  samples: number;
  threshold: number | null;
  status: 'good' | 'needs-work' | 'unknown';
  worstPaths: PathRow[];
};
type Vitals = {
  days: number;
  totalSamples: number;
  metrics: Metric[];
  note?: string;
};

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E8E4E0', borderRadius: 12, padding: 14,
};

const RANGES = [1, 7, 28, 90];

/** CLS is a unitless ratio; the rest are milliseconds. */
const fmt = (name: string, v: number) =>
  name === 'CLS' ? v.toFixed(3) : `${Math.round(v)} ms`;

export function VitalsTab({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<Vitals | null>(null);
  const [days, setDays] = useState(7);

  const fetchVitals = useCallback(async (): Promise<Vitals | null> => {
    try {
      const res = await fetch(`/api/admin/vitals?days=${days}`);
      const json = await res.json();
      if (!res.ok) { toast(json.error ?? 'Could not load vitals'); return null; }
      return json as Vitals;
    } catch {
      toast('Could not load vitals');
      return null;
    }
  }, [days, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchVitals();
      if (!cancelled && next) setData(next);
    })();
    return () => { cancelled = true; };
  }, [fetchVitals]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {RANGES.map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
            style={{
              fontSize: 12, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid ' + (days === d ? '#141413' : '#E8E4E0'),
              background: days === d ? '#141413' : '#fff',
              color: days === d ? '#F3F0EE' : '#141413',
            }}>
            {d === 1 ? '24 hours' : `${d} days`}
          </button>
        ))}
        {data && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#767676' }}>
            {data.totalSamples.toLocaleString('en-IN')} samples
          </span>
        )}
      </div>

      {data === null ? (
        <div style={{ ...CARD, fontSize: 13, color: '#767676' }}>Loading vitals…</div>
      ) : data.note ? (
        <div style={{ ...CARD, fontSize: 13, color: '#767676' }}>{data.note}</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.metrics.map((m) => (
            <div key={m.name} style={CARD}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{m.name}</strong>
                <span style={{
                  fontSize: 22, fontWeight: 700,
                  color: m.status === 'good' ? '#15803D' : m.status === 'needs-work' ? '#B45309' : '#141413',
                }}>
                  {fmt(m.name, m.p75)}
                </span>
                {m.threshold != null && (
                  <span style={{ fontSize: 12, color: '#767676' }}>
                    p75 · good is under {fmt(m.name, m.threshold)}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#767676' }}>
                  {m.samples.toLocaleString('en-IN')} samples
                </span>
              </div>

              {m.worstPaths.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                  <tbody>
                    {m.worstPaths.map((p) => (
                      <tr key={p.path} style={{ borderTop: '1px solid #F5F2EF' }}>
                        <td style={{ padding: '6px 0' }}>{p.path}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap',
                          color: m.threshold != null && p.p75 > m.threshold ? '#B45309' : '#141413' }}>
                          {fmt(m.name, p.p75)}
                        </td>
                        <td style={{ padding: '6px 0 6px 14px', textAlign: 'right', color: '#767676', whiteSpace: 'nowrap' }}>
                          {p.samples}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {m.worstPaths.length === 0 && (
                <div style={{ fontSize: 12, color: '#767676', marginTop: 8 }}>
                  No path has five samples yet, so a per-path p75 would be noise.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
