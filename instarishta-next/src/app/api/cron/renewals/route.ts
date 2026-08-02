/**
 * GET|POST /api/cron/renewals?days=14
 *
 * T-14 renewal reminder. Memberships never auto-renew (no mandate, by design),
 * so a member whose term lapses simply stops getting credits — this is the only
 * thing that tells anyone in advance.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`). Without
 * CRON_SECRET set the route refuses to run rather than defaulting to open —
 * it exposes who is about to churn.
 *
 * Schedule it with pg_cron + pg_net, a Vercel cron, or any external pinger.
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/credits';
import { planLabel } from '@/lib/plans';

export const runtime = 'nodejs';

interface Expiring {
  email: string;
  full_name: string | null;
  plan: string;
  plan_expires_at: string;
  days_left: number;
}

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

  const days = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 14));

  const db = serviceClient();
  const { data, error } = await db.rpc('ir_expiring_plans', { p_days: days });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Expiring[];
  if (rows.length === 0) return NextResponse.json({ ok: true, expiring: 0 });

  await notify(rows, days);
  return NextResponse.json({ ok: true, expiring: rows.length, days });
}

export const GET  = run;
export const POST = run;

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notify(rows: Expiring[], days: number) {
  const token  = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const target = process.env.TELEGRAM_TARGET?.trim();
  if (!token || !target) return;

  const lines = [
    `<b>⏳ Memberships expiring within ${days} days</b>`,
    ``,
    ...rows.slice(0, 40).map(r =>
      `• ${esc(r.full_name || r.email)} — ${esc(planLabel(r.plan))}, ` +
      `${r.days_left} day${r.days_left === 1 ? '' : 's'} left (${new Date(r.plan_expires_at).toLocaleDateString('en-IN')})\n` +
      `  <code>${esc(r.email)}</code>`,
    ),
    ...(rows.length > 40 ? [``, `…and ${rows.length - 40} more.`] : []),
    ``,
    `<b>Note:</b> nothing renews automatically — if they do not re-purchase, credits stop refilling at expiry.`,
  ];

  const payload: Record<string, unknown> = {
    chat_id: target, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true,
  };
  const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID?.trim();
  if (threadId) payload.message_thread_id = threadId;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
}
