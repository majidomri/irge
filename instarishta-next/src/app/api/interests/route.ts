/**
 * GET  /api/interests  → { usedMonth, usedDay, monthly, daily, interests[] }
 * POST /api/interests  { profileId, chip, num?, title?, gender? }
 *        200 → { ok:true, usedMonth, interestId }
 *        409 → already sent an interest on this profile
 *        429 → monthly or daily allowance exhausted
 *
 * Sending an interest is FREE — no contact credit. The credit is spent later,
 * only if the advertiser agrees to connect (see /api/interests/reveal).
 *
 * The sender picks from a fixed chip vocabulary; there is no free-text field,
 * so there is nothing to moderate. Gated by a better-auth session. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import { sendInterest, interestUsage, myInterests } from '@/lib/interests';
import { interestAllowance } from '@/lib/plans';
import { isChipKey, chipLabel } from '@/lib/interest-chips';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name ?? null);
  const { monthly, daily } = interestAllowance(profile.plan);
  const [usage, interests] = await Promise.all([
    interestUsage(db, session.user.id),
    myInterests(db, session.user.email),
  ]);

  return NextResponse.json({ ...usage, monthly, daily, interests });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const profileId = typeof body.profileId === 'number' ? body.profileId : null;
  const chip      = body.chip;

  if (profileId === null) {
    return NextResponse.json({ error: 'Missing profile' }, { status: 400 });
  }
  // Only keys from the fixed vocabulary — nothing user-authored ever stored.
  if (!isChipKey(chip)) {
    return NextResponse.json({ error: 'Please choose one of the listed messages' }, { status: 400 });
  }

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name ?? null);
  if (profile.is_banned) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const { monthly, daily } = interestAllowance(profile.plan);

  const result = await sendInterest(db, {
    email:     session.user.email,
    userId:    session.user.id,
    name:      profile.full_name ?? session.user.name ?? null,
    profileId,
    num:       typeof body.num === 'number' ? body.num : null,
    title:     typeof body.title === 'string' ? body.title : '',
    gender:    typeof body.gender === 'string' ? body.gender : null,
    chip,
    monthly,
    daily,
  });

  if (!result.ok) {
    const status = result.reason === 'duplicate' ? 409 : 429;
    return NextResponse.json({ ...result, monthly, daily }, { status });
  }

  // Route the lead to the team. Best-effort: the interest is already durably
  // recorded, and a Telegram outage must not lose it.
  void notifyLead({
    title:  typeof body.title === 'string' ? body.title : '',
    num:    body.num,
    gender: body.gender,
    profileId,
    chip,
    from:   session.user.email,
    name:   profile.full_name ?? session.user.name ?? null,
    used:   result.usedMonth,
    monthly,
  }).catch(() => {});

  return NextResponse.json({
    ok: true, usedMonth: result.usedMonth, usedDay: result.usedDay,
    interestId: result.interestId, monthly,
  });
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Notify the team about a new lead.
 *
 * NOT the advertiser directly: the upstream feed returns the same
 * phone/whatsapp (+918886667121, the business relay) on every one of its 500
 * profiles, so there is no per-advertiser contact to reach. The team relays and
 * records the answer in /nizam.
 */
async function notifyLead(i: {
  title: string; num: unknown; gender: unknown; profileId: number;
  chip: string; from: string; name: string | null; used: number; monthly: number;
}) {
  const token  = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const target = process.env.TELEGRAM_TARGET?.trim();
  if (!token || !target) return;

  const lines = [
    `<b>💚 New Lead — Interest</b>`,
    ``,
    `<b>Profile:</b> IR #${esc(i.num)} (feed id ${i.profileId}) — ${esc(i.gender === 'female' ? 'Bride' : 'Groom')}`,
    `<b>Title:</b> ${esc(i.title)}`,
    ``,
    `<b>Message:</b> ${esc(chipLabel(i.chip))}`,
    `<b>From:</b> ${esc(i.name ?? '—')} · ${esc(i.from)} (${i.used}/${i.monthly} this month)`,
    ``,
    `<b>Next:</b> tell the advertiser, then record their answer in`,
    `/nizam → Interests → <b>Wants to connect</b> or <b>Declined</b>.`,
    `Only after "Wants to connect" can the member spend a credit to see the number.`,
    ``,
    `<b>Time:</b> ${new Date().toISOString()}`,
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
