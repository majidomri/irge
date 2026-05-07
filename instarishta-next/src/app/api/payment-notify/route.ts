import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PLANS: Record<string, { credits: number; price: number }> = {
  silver:   { credits: 20,  price: 99  },
  gold:     { credits: 50,  price: 199 },
  platinum: { credits: 100, price: 349 },
};

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

  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    plan  = String(fd.get('plan')  ?? '').toLowerCase();
    utr   = String(fd.get('utr')   ?? '');
    email = String(fd.get('email') ?? '');
    const file = fd.get('screenshot');
    if (file instanceof File && file.size > 0) {
      screenshotBytes = Buffer.from(await file.arrayBuffer());
    }
  } else {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    plan  = (body.plan  ?? '').toLowerCase();
    utr   = body.utr   ?? '';
    email = body.email ?? '';
  }

  const planInfo = PLANS[plan];
  const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID?.trim();

  const lines = [
    `<b>💳 InstaRishta Payment Request</b>`,
    ``,
    `<b>Plan:</b> ${esc(plan.charAt(0).toUpperCase() + plan.slice(1))} — ${planInfo?.credits ?? '?'} credits / ₹${planInfo?.price ?? '?'}`,
    `<b>User:</b> ${esc(email)}`,
    `<b>UTR / Txn ID:</b> <code>${esc(utr)}</code>`,
    `<b>Screenshot:</b> ${screenshotBytes ? 'Attached below' : 'Not provided'}`,
    ``,
    `<b>Action needed:</b> Verify payment & top up credits in Supabase.`,
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
