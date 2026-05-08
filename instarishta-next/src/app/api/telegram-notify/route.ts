import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/typed-route';

export const runtime = 'nodejs';

function escape(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const POST = withRoute(async (_req, body) => {
  const token  = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const target = process.env.TELEGRAM_TARGET?.trim();
  if (!token || !target) return NextResponse.json({ ok: false, error: 'Telegram not configured' }, { status: 503 });

  const { profileNum, profileTitle, profileBody, gender, action = 'contact' } = body;

  const lines = [
    `<b>📲 InstaRishta Contact</b>`,
    ``,
    `<b>Action:</b> ${escape(action)}`,
    `<b>Profile:</b> IR #${escape(profileNum)} — ${escape(gender === 'female' ? 'Bride' : 'Groom')}`,
    `<b>Title:</b> ${escape(profileTitle)}`,
    ``,
    `<b>Body excerpt:</b>`,
    `<pre>${escape(String(profileBody ?? '').slice(0, 400))}</pre>`,
    ``,
    `<b>Time:</b> ${new Date().toISOString()}`,
  ];

  const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID?.trim();
  const payload: Record<string, unknown> = {
    chat_id: target,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (threadId) payload.message_thread_id = threadId;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.ok) {
    return NextResponse.json({ ok: false, error: result?.description ?? `HTTP ${res.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
});
