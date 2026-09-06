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
 * Reports land in the platform logs rather than a table. That is deliberate
 * for a first pass: it answers "did the INP work help" without a migration,
 * and it stores nothing tied to a person. If this becomes something you want
 * to chart over time, that is the point to give it a table.
 *
 * No PII: the payload carries a pathname, timings, and an element description
 * built from authored attributes (data-vitals, role, aria-label) — never
 * profile content, never a query string.
 */
import { NextResponse } from 'next/server';

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

    for (const metric of payload.metrics.slice(0, 20)) {
      // One line per metric so log search can filter on the name.
      console.log('[web-vitals]', JSON.stringify({ url, ...(metric as object) }));
    }
  } catch {
    // Malformed body. Still 204 — see above.
  }

  return NO_CONTENT;
}
