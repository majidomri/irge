import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { auth } from '@/lib/auth';
import { getPlan, totalCredits, TOPUP } from '@/lib/plans';

/** Human summary of what the user says they paid for, from the shared catalog. */
function describe(id: string): { label: string; detail: string; price: number | null } {
  const plan = getPlan(id);
  if (plan) {
    return {
      label:  plan.name,
      detail: `${plan.monthlyCredits} credits/month × ${plan.months} months = ${totalCredits(plan)} total`,
      price:  plan.price,
    };
  }
  if (id === TOPUP.id) {
    return { label: TOPUP.name, detail: `${TOPUP.credits} one-time credits (never expire)`, price: TOPUP.price };
  }
  return { label: id || 'unknown', detail: 'UNRECOGNISED — verify manually', price: null };
}

/** Telegram's own sendPhoto ceiling. */
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegram(token: string, target: string, text: string, threadId?: string) {
  const payload: Record<string, unknown> = {
    chat_id: target, text, parse_mode: 'HTML', disable_web_page_preview: true,
  };
  if (threadId) payload.message_thread_id = threadId;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

async function sendPhoto(token: string, target: string, caption: string, photoBytes: Buffer, threadId?: string) {
  const form = new FormData();
  form.append('chat_id', target);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  if (threadId) form.append('message_thread_id', threadId);
  form.append('photo', new Blob([photoBytes.buffer as ArrayBuffer], { type: 'image/jpeg' }), 'payment.jpg');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST', body: form,
  });
  return res.ok;
}

export async function POST(req: NextRequest) {
  const token  = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const target = process.env.TELEGRAM_TARGET?.trim();
  if (!token || !target) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 });

  let plan = '', utr = '', email = '', screenshotBytes: Buffer | null = null;
  let oversized = false;

  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    plan  = String(fd.get('plan')  ?? '').toLowerCase();
    utr   = String(fd.get('utr')   ?? '');
    email = String(fd.get('email') ?? '');
    const file = fd.get('screenshot');
    // Capped before the read, not after: an unauthenticated caller should not
    // be able to decide how much memory this buffers. 10 MB is Telegram's own
    // sendPhoto ceiling, so anything larger would have failed there anyway.
    if (file instanceof File && file.size > 0) {
      if (file.size <= MAX_SCREENSHOT_BYTES) {
        screenshotBytes = Buffer.from(await file.arrayBuffer());
      } else {
        oversized = true;
      }
    }
  } else {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    plan  = (body.plan  ?? '').toLowerCase();
    utr   = body.utr   ?? '';
    email = body.email ?? '';
  }

  const info     = describe(plan);
  const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID?.trim();

  /**
   * Who is actually asking.
   *
   * This endpoint stays open to signed-out visitors on purpose — somebody
   * buying their first plan may not have an account yet — and it grants
   * nothing by itself: an admin reads the message and does the grant by hand
   * in /nizam. That human step is exactly why the identity has to be
   * trustworthy. The `email` field is typed by the caller, so a forged request
   * could name a real member's address and the admin had no way to tell it
   * apart from a genuine one.
   *
   * So the session is read here and reported separately. Nothing is blocked on
   * it; the message just stops presenting a self-declared address as fact.
   */
  let sessionEmail: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    sessionEmail = session?.user?.email ?? null;
  } catch {
    // Never fail a payment notification over the session lookup — a message
    // that reaches an admin unattested beats one that never arrives.
    sessionEmail = null;
  }

  const claimed = email.trim();
  const identity = sessionEmail
    ? claimed && claimed.toLowerCase() !== sessionEmail.toLowerCase()
      ? `<code>${esc(sessionEmail)}</code> (signed in) — ⚠️ but typed <code>${esc(claimed)}</code>`
      : `<code>${esc(sessionEmail)}</code> (signed in)`
    : `<code>${esc(claimed || 'not given')}</code> — ⚠️ not signed in, unverified`;

  const action = getPlan(plan)
    ? `Verify payment, then <b>/nizam → Users → Activate ${info.label}</b>.`
    : plan === TOPUP.id
      ? `Verify payment, then <b>/nizam → Users → +${TOPUP.credits} top-up</b>.`
      : `⚠️ Unrecognised plan id — do not activate until confirmed with the user.`;

  const lines = [
    `<b>💳 InstaRishta Payment Request</b>`,
    ``,
    `<b>Plan:</b> ${esc(info.label)} — ₹${info.price ?? '?'}`,
    `<b>Grants:</b> ${esc(info.detail)}`,
    `<b>User:</b> ${identity}`,
    `<b>UTR / Txn ID:</b> <code>${esc(utr)}</code>`,
    `<b>Screenshot:</b> ${screenshotBytes ? 'Attached below' : oversized ? '⚠️ Rejected — over 10 MB' : 'Not provided'}`,
    ``,
    `<b>Action needed:</b> ${action}`,
    `<b>Time:</b> ${new Date().toISOString()}`,
  ];

  const text = lines.join('\n');

  if (screenshotBytes) {
    await sendPhoto(token, target, text, screenshotBytes, threadId);
  } else {
    await sendTelegram(token, target, text, threadId);
  }

  return NextResponse.json({ ok: true });
}
