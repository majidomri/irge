'use client';

import { useCallback, useEffect, useState } from 'react';
import { CARD, BORDER, TEXT, MUTED, GREEN, AMBER, chip } from './theme';

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
              ...chip(days === d),
            }}>
            {d === 1 ? '24 hours' : `${d} days`}
          </button>
        ))}
        {data && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>
            {data.totalSamples.toLocaleString('en-IN')} samples
          </span>
        )}
      </div>

      {data === null ? (
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>Loading vitals…</div>
      ) : data.note ? (
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>{data.note}</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.metrics.map((m) => (
            <div key={m.name} style={CARD}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{m.name}</strong>
                <span style={{
                  fontSize: 22, fontWeight: 700,
                  color: m.status === 'good' ? GREEN : m.status === 'needs-work' ? AMBER : TEXT,
                }}>
                  {fmt(m.name, m.p75)}
                </span>
                {m.threshold != null && (
                  <span style={{ fontSize: 12, color: MUTED }}>
                    p75 · good is under {fmt(m.name, m.threshold)}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>
                  {m.samples.toLocaleString('en-IN')} samples
                </span>
              </div>

              {m.worstPaths.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                  <tbody>
                    {m.worstPaths.map((p) => (
                      <tr key={p.path} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '6px 0' }}>{p.path}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap',
                          color: m.threshold != null && p.p75 > m.threshold ? AMBER : TEXT }}>
                          {fmt(m.name, p.p75)}
                        </td>
                        <td style={{ padding: '6px 0 6px 14px', textAlign: 'right', color: MUTED, whiteSpace: 'nowrap' }}>
                          {p.samples}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {m.worstPaths.length === 0 && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
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
