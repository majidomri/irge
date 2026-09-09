/**
 * POST /api/admin/rcs/capability — which of these numbers can receive RCS?
 *
 * Body: { recipients: string[], refresh?: boolean }
 *
 * Answering this before composing is the difference between "sent to 40, 3
 * arrived" and knowing up front that 37 of them need SMS or WhatsApp instead.
 *
 * ── Why per-number, and not users:batchGet ───────────────────────────────────
 * The bulk endpoint refuses anything under 500 numbers and 400s if one request
 * mixes regions, so for an admin checking a filtered list of forty advertisers
 * it is simply unavailable. Per-number it is, with a cache table so the same
 * list checked twice costs one round of calls, not two.
 *
 * A 404 from the capability endpoint means "not reachable" and covers two facts
 * Google deliberately does not separate: the handset has no RCS, or our agent
 * is not launched on that carrier. Both mean the same thing to a sender.
 *
 * Admin-gated by withAdmin. Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { checkCapability } from '@/lib/rcs/client';
import { rcsReadiness, toE164 } from '@/lib/rcs/config';

export const runtime = 'nodejs';

/** Numbers per request. Each is one HTTP round trip, so this is a time budget. */
const MAX_CHECK = 200;

/**
 * How long a cached answer is trusted.
 *
 * Reachability genuinely changes — someone buys an Android phone, a carrier
 * finishes rolling out, our agent gets approved on a new network — so this
 * cannot be cached forever. A day is short enough to follow those changes and
 * long enough that composing a campaign does not re-check the same list.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

export const POST = withAdmin(async (_req, { body, db }) => {
  const readiness = rcsReadiness();

  const raw = Array.isArray(body.recipients) ? body.recipients : [];
  if (raw.length === 0) return NextResponse.json({ error: 'No recipients' }, { status: 400 });

  const numbers: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const e164 = toE164(String(entry ?? ''));
    if (!e164) { invalid.push(String(entry)); continue; }
    if (seen.has(e164)) continue;
    seen.add(e164);
    numbers.push(e164);
  }

  if (numbers.length === 0) {
    return NextResponse.json({ error: 'No valid E.164 numbers', invalid }, { status: 400 });
  }
  if (numbers.length > MAX_CHECK) {
    return NextResponse.json({ error: `${numbers.length} numbers — the cap is ${MAX_CHECK} per check` }, { status: 400 });
  }

  // Unconfigured: report honestly rather than claiming everyone is unreachable.
  // "We cannot check" and "they cannot receive" are different facts, and
  // conflating them would have an admin writing off an audience over a missing
  // env var.
  if (!readiness.ready) {
    return NextResponse.json({
      readiness, checked: 0,
      results: numbers.map(phone => ({ phone, reachable: null as boolean | null, cached: false })),
      note: `Cannot check reachability — RCS is not configured (missing ${readiness.missing.join(', ')}).`,
    });
  }

  const fresh = new Date(Date.now() - TTL_MS).toISOString();
  const cache = new Map<string, { reachable: boolean; features: string[] }>();

  if (body.refresh !== true) {
    const { data } = await db
      .from('ir_rcs_capability')
      .select('phone, reachable, features')
      .in('phone', numbers)
      .gte('checked_at', fresh);
    for (const row of data ?? []) {
      cache.set(row.phone as string, {
        reachable: row.reachable as boolean,
        features:  (row.features as string[]) ?? [],
      });
    }
  }

  const results: { phone: string; reachable: boolean | null; features: string[]; cached: boolean; error?: string }[] = [];
  const toPersist: { phone: string; reachable: boolean; features: string[]; checked_at: string }[] = [];

  for (const phone of numbers) {
    const hit = cache.get(phone);
    if (hit) {
      results.push({ phone, reachable: hit.reachable, features: hit.features, cached: true });
      continue;
    }

    const live = await checkCapability(phone);
    if (live.error) {
      // A transport or auth failure is NOT evidence of unreachability, so it is
      // never cached — caching it would poison the list for a day over a blip.
      results.push({ phone, reachable: null, features: [], cached: false, error: live.error });
      continue;
    }

    results.push({ phone, reachable: live.reachable, features: live.features, cached: false });
    toPersist.push({ phone, reachable: live.reachable, features: live.features, checked_at: new Date().toISOString() });
  }

  if (toPersist.length) {
    await db.from('ir_rcs_capability').upsert(toPersist, { onConflict: 'phone' });
  }

  return NextResponse.json({
    readiness,
    checked:     results.length,
    reachable:   results.filter(r => r.reachable === true).length,
    unreachable: results.filter(r => r.reachable === false).length,
    unknown:     results.filter(r => r.reachable === null).length,
    results,
    invalid,
  });
});
