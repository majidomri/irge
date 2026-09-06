/**
 * POST /api/track  → record one interaction with a listing
 *   204 always
 *
 * The write side of ir_profile_events. Same contract as /api/vitals and
 * /api/errors, for the same reason: it is fired by sendBeacon as a card
 * scrolls past or a page is left, so nothing reads the response and a 4xx
 * would only ever be a failed request in somebody's network panel.
 *
 * The source is classified here, on the server, and never taken from the
 * client. A browser can lie about its referrer and a script can post whatever
 * it likes — but the Referer header on this request is the browser's own, and
 * the landing URL is what carries the UTM. Trusting a client-supplied
 * "source: google" would make the whole dashboard fiction.
 *
 * No PII: a salted hash of address plus entity, a country, a device class.
 * Deliberately no user id — knowing which member looked at which rishta is
 * surveillance, not analytics, and /nizam does not need it to answer "where is
 * this listing being seen".
 */
import { createHash } from 'node:crypto';

import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { serviceClient } from '@/lib/credits';
import { clientIp, deviceClass, geoFrom } from '@/lib/request-context';
import { classifySource } from '@/lib/traffic-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_CONTENT = new NextResponse(null, { status: 204 });

/** A beacon larger than this is not one of ours. */
const MAX_BODY_BYTES = 8 * 1024;

/** Only these are recorded; anything else is a typo or someone probing. */
const EVENTS = new Set(['view', 'impression', 'click', 'share', 'listen', 'contact']);
const ENTITIES = new Set(['profile', 'biodata', 'post', 'story', 'channel']);

/** Impressions arrive in batches as a feed scrolls. */
const MAX_BATCH = 60;

type Incoming = { entityType?: unknown; entityId?: unknown; event?: unknown };

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return NO_CONTENT;

    const body = JSON.parse(raw) as { url?: unknown; events?: unknown };
    if (!Array.isArray(body.events) || body.events.length === 0) return NO_CONTENT;

    const landing = typeof body.url === 'string' ? body.url : null;
    const selfHost = req.nextUrl.hostname;
    const { source, detail } = classifySource(
      req.headers.get('referer'),
      landing,
      selfHost,
    );

    const ip = clientIp(req.headers);
    const geo = geoFrom(req.headers);
    const device = deviceClass(req.headers.get('user-agent') ?? '');

    // Salt with the address so the same person on the same listing collapses
    // to one hash, and the hash is useless anywhere else.
    const salt = process.env.FIREWALL_SECRET ?? 'ir';

    const rows = (body.events as Incoming[])
      .slice(0, MAX_BATCH)
      .filter((e) =>
        typeof e.entityType === 'string' && ENTITIES.has(e.entityType) &&
        typeof e.entityId === 'string' && e.entityId.length > 0 && e.entityId.length <= 64 &&
        typeof e.event === 'string' && EVENTS.has(e.event))
      .map((e) => ({
        entity_type: e.entityType as string,
        entity_id: e.entityId as string,
        event: e.event as string,
        source,
        source_detail: detail,
        country: geo.country ?? null,
        device,
        visitor_hash: createHash('sha256')
          .update(`${salt}:${ip}:${e.entityId as string}`)
          .digest('hex')
          .slice(0, 16),
      }));

    if (rows.length === 0) return NO_CONTENT;

    // after(), not a floating promise: the 204 returns immediately but the
    // runtime keeps the invocation alive for the insert. A bare `void insert()`
    // here would be killed mid-flight on a serverless freeze — the same bug
    // proxy.ts documents and /api/vitals had.
    after(async () => {
      const { error } = await serviceClient().from('ir_profile_events').insert(rows);
      if (error) console.error('[track] insert failed:', error.message);
    });
  } catch {
    // Malformed body. Still 204 — see above.
  }

  return NO_CONTENT;
}
