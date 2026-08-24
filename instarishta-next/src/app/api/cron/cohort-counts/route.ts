/**
 * GET|POST /api/cron/cohort-counts
 *
 * Recomputes every cohort's published member_count from ir_user_profiles and
 * reports the result.
 *
 * The counts are public marketing copy — "412 verified doctors" on the
 * cohorts page — which is exactly why they need a reconciler. The incremental
 * path (ir_approve_verification, migration 016) is correct on its own, but a
 * banned member, a manual SQL fix or a restore all move the truth without
 * moving the counter, and a number that drifts in public is worse than no
 * number. This is the repair job; it is idempotent and safe to run often.
 *
 * `admittedThisMonth` is computed here rather than stored: it is a rolling
 * figure ("38 admitted this month") that would be stale the moment it was
 * cached, and it is cheap — one indexed count over reviewed requests.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`), matching
 * /api/cron/renewals. Without CRON_SECRET set the route refuses to run rather
 * than defaulting to open.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/credits';

export const runtime = 'nodejs';

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;                       // fail closed
  const header = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const query  = new URL(req.url).searchParams.get('secret')?.trim();
  return header === secret || query === secret;
}

async function run(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = serviceClient();

  const { error: rpcError } = await db.rpc('ir_reconcile_cohort_counts');
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  const { data: cohorts, error } = await db
    .from('ir_channels')
    .select('slug, name, profession_key, member_count')
    .eq('is_cohort', true)
    .order('member_count', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Approvals since the start of the current month, in UTC. Good enough for a
  // marketing figure — nobody is auditing the timezone boundary on "this
  // month", and IST would shift it by 5.5 hours at most.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count: admittedThisMonth } = await db
    .from('ir_verification_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gte('reviewed_at', monthStart.toISOString());

  const rows  = cohorts ?? [];
  const total = rows.reduce((sum, c) => sum + (c.member_count ?? 0), 0);

  return NextResponse.json({
    ok: true,
    reconciledAt: new Date().toISOString(),
    totalVerified: total,
    admittedThisMonth: admittedThisMonth ?? 0,
    cohorts: rows,
  });
}

export const GET  = run;
export const POST = run;
