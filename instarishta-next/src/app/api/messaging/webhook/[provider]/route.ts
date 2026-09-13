/**
 * /api/messaging/webhook/[provider] — delivery reports and replies.
 *
 * PUBLIC: the aggregator calls it, so there is no session. The provider's
 * parseWebhook decides whether the request is genuine (for Ojiva, the shared
 * token in the callback URL); anything it does not authorise gets 403 and
 * nothing is stored.
 *
 * GET and POST both land here because Indian gateways use either for DLRs.
 *
 * ── Status codes ─────────────────────────────────────────────────────────────
 * 200 for everything accepted, including duplicates and records we could not
 * map — a non-2xx makes most gateways retry, and retrying an unparseable
 * receipt forever helps nobody. The raw payload is stored either way, so an
 * unmapped format is visible in the log and fixable. 500 only when storage
 * itself failed, which is the one case a retry can fix.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { ingestEvents } from '@/lib/messaging/events';
import { providerById } from '@/lib/messaging/providers';
import type { AdminDb } from '@/lib/admin-route';

export const runtime = 'nodejs';

/** Bodies bigger than this are not delivery reports. */
const MAX_BODY = 512 * 1024;

async function handle(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params;
  const provider = providerById(id);
  if (!provider) return new NextResponse('unknown provider', { status: 404 });

  const rawBody = req.method === 'POST' ? await req.text() : '';
  if (rawBody.length > MAX_BODY) return new NextResponse('too large', { status: 413 });

  const url = new URL(req.url);
  const { authorized, events } = provider.parseWebhook({
    method: req.method, headers: req.headers, query: url.searchParams, rawBody,
  });
  if (!authorized) return new NextResponse('forbidden', { status: 403 });
  if (events.length === 0) return NextResponse.json({ ok: true, stored: 0 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  ) as AdminDb;

  try {
    const r = await ingestEvents(db, provider.id, events.slice(0, 1000));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error(`[messaging:${id}] webhook storage failed:`, (e as Error).message);
    return new NextResponse('storage failed', { status: 500 });
  }
}

export const GET  = handle;
export const POST = handle;
