/**
 * GET /api/admin/vitals?days=7  — field Core Web Vitals, summarised
 *
 * The read side of ir_web_vitals. Lighthouse says what one machine on one
 * network did; this says what visitors actually got, which is the number the
 * Core Web Vitals thresholds are defined against.
 *
 * p75, not the mean. Google assesses a site at the 75th percentile, and a mean
 * hides exactly the tail that assessment is about — one slow phone in ten is
 * invisible in an average and decisive in a p75.
 *
 * Returns the overall p75 per metric plus the worst paths, because "INP is
 * 240ms" is not actionable and "INP is 240ms on /channels/[slug]" is.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';

/** Google's "good" thresholds, so the response says pass or fail on its own. */
const GOOD = { LCP: 2500, INP: 200, CLS: 0.1 } as const;

type Row = { name: string; value: number; path: string };

function p75(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank: the smallest value at or above 75% of the sample.
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
  return sorted[Math.max(0, index)];
}

export const GET = withAdmin(async (req, { db }) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await db
    .from('ir_web_vitals')
    .select('name, value, path')
    .gte('created_at', since)
    // Bounded on purpose: a p75 does not get more true with a million rows,
    // and an unbounded read here would be the anti-pattern this route exists
    // to help find.
    .limit(50_000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as Row[];
  const byMetric = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byMetric.get(row.name);
    if (list) list.push(row);
    else byMetric.set(row.name, [row]);
  }

  const metrics = [...byMetric.entries()].map(([name, list]) => {
    const overall = p75(list.map((r) => r.value));

    const byPath = new Map<string, number[]>();
    for (const r of list) {
      const list2 = byPath.get(r.path);
      if (list2) list2.push(r.value);
      else byPath.set(r.path, [r.value]);
    }

    const paths = [...byPath.entries()]
      // A path with two samples has no meaningful p75; it just has two numbers.
      .filter(([, values]) => values.length >= 5)
      .map(([path, values]) => ({ path, p75: p75(values), samples: values.length }))
      .sort((a, b) => b.p75 - a.p75)
      .slice(0, 5);

    const good = GOOD[name as keyof typeof GOOD];

    return {
      name,
      p75: overall,
      samples: list.length,
      threshold: good ?? null,
      status: good == null ? 'unknown' : overall <= good ? 'good' : 'needs-work',
      worstPaths: paths,
    };
  });

  metrics.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    days,
    since,
    totalSamples: rows.length,
    metrics,
    // Said plainly so an empty response is not mistaken for a healthy one.
    note: rows.length === 0 ? 'No samples yet — beacons arrive as visitors leave pages.' : undefined,
  });
});
