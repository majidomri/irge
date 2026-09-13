/**
 * GET /api/admin/messaging/settings
 * PUT /api/admin/messaging/settings — partial update.
 *
 * Switching to live mode is refused unless the provider can actually reach
 * phones. "Live" on a sandbox would read as though campaigns were going out.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { DLT_ID, parseNumbers } from '@/lib/messaging/dlt';
import { activeProvider } from '@/lib/messaging/providers';
import { loadSettings } from '@/lib/messaging/store';

export const runtime = 'nodejs';

export const GET = withAdmin(async (_req, { db }) => NextResponse.json({ settings: await loadSettings(db) }));

export const PUT = withAdmin(async (_req, { db, body, email }) => {
  const patch: Record<string, unknown> = {};
  const problems: string[] = [];

  if ('dlt_entity_id' in body) {
    const v = String(body.dlt_entity_id ?? '').trim();
    if (v && !DLT_ID.test(v)) problems.push('DLT entity ID must be 19 digits');
    patch.dlt_entity_id = v || null;
  }

  if ('test_numbers' in body) {
    const raw = Array.isArray(body.test_numbers) ? body.test_numbers.join('\n') : String(body.test_numbers ?? '');
    const { valid, invalid } = parseNumbers(raw);
    if (invalid.length) problems.push(`Not valid numbers: ${invalid.join(', ')}`);
    if (valid.length > 20) problems.push('At most 20 test numbers');
    patch.test_numbers = valid;
  }

  for (const k of ['sms_enabled', 'rcs_enabled'] as const) {
    if (k in body) patch[k] = body[k] === true;
  }

  if ('promo_window_start' in body || 'promo_window_end' in body) {
    const start = Number(body.promo_window_start ?? 9);
    const end   = Number(body.promo_window_end ?? 21);
    // TRAI's window is 09–21. Narrowing is allowed; widening is not.
    if (!(start >= 9 && end <= 21 && start < end)) problems.push('Promotional window must sit inside 09:00–21:00');
    patch.promo_window_start = start;
    patch.promo_window_end = end;
  }

  if ('daily_cap' in body) {
    const cap = Number(body.daily_cap);
    if (!Number.isInteger(cap) || cap < 0 || cap > 200_000) problems.push('Daily cap must be a whole number up to 200,000');
    patch.daily_cap = cap;
  }

  if ('mode' in body) {
    const mode = body.mode === 'live' ? 'live' : 'test';
    if (mode === 'live') {
      const r = activeProvider().readiness();
      if (!r.ready || !r.reachesPhones) {
        problems.push('Live mode needs a connected provider that reaches phones — the sandbox cannot go live');
      }
    }
    patch.mode = mode;
  }

  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  patch.updated_by = email;
  patch.updated_at = new Date().toISOString();

  const { error } = await db.from('ir_msg_settings').update(patch).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, settings: await loadSettings(db) });
});
