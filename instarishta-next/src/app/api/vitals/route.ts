/**
 * POST /api/vitals  → receive a Core Web Vitals beacon
 *   204 always, whatever the body looked like
 *
 * Fired by <WebVitals /> from sendBeacon when the page is hidden or unloaded.
 *
 * Always 204, never an error. A beacon is sent as the page goes away, so the
 * sender is gone before a response arrives and nothing can retry — a 4xx here
 * would be a log line nobody reads, in exchange for a failed request in the
 * visitor's network panel.
 *
 * Reports go to the platform logs *and* to ir_web_vitals. The logs answer
 * "what is happening right now" while someone is watching; the table answers
 * "what was the p75 last week, and did that deploy move it", which a log tail
 * cannot. Lighthouse measures one machine on one network — this is the field
 * half, and the half that decides whether the work mattered.
 *
 * The insert is fire-and-forget and its failure is swallowed. A beacon is
 * sent as the page goes away and the response is never read, so a database
 * problem must not turn into a slow request on the way out.
 *
 * No PII: the payload carries a pathname, timings, and an element description
 * built from authored attributes (data-vitals, role, aria-label) — never
 * profile content, never a query string.
 */
import { NextResponse } from 'next/server';

import { serviceClient } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A beacon larger than this is not one of ours. */
const MAX_BODY_BYTES = 16 * 1024;

const NO_CONTENT = new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return NO_CONTENT;

    const payload = JSON.parse(raw) as {
      url?: unknown;
      metrics?: unknown;
    };

    if (!Array.isArray(payload.metrics)) return NO_CONTENT;

    const url = typeof payload.url === 'string' ? payload.url.slice(0, 200) : '(unknown)';

    const metrics = payload.metrics.slice(0, 20) as Array<Record<string, unknown>>;

    for (const metric of metrics) {
      // One line per metric so log search can filter on the name.
      console.log('[web-vitals]', JSON.stringify({ url, ...metric }));
    }

    const rows = metrics
      .filter((m) => typeof m.name === 'string' && Number.isFinite(Number(m.value)))
      .map((m) => ({
        name: String(m.name).slice(0, 20),
        value: Number(m.value),
        rating: typeof m.rating === 'string' ? m.rating.slice(0, 20) : null,
        path: url,
        target: typeof m.target === 'string' ? m.target.slice(0, 200) : null,
        load_state: typeof m.loadState === 'string' ? m.loadState.slice(0, 40) : null,
      }));

    if (rows.length) {
      // Not awaited: see the note above about beacons.
      void serviceClient()
        .from('ir_web_vitals')
        .insert(rows)
        .then(({ error }) => {
          if (error) console.error('[web-vitals] insert failed:', error.message);
        });
    }
  } catch {
    // Malformed body. Still 204 — see above.
  }

  return NO_CONTENT;
}
