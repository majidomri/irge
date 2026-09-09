/**
 * POST /api/rcs/webhook — delivery receipts, read receipts and user replies.
 *
 * PUBLIC by necessity: Google calls it, so there is no session. Authentication
 * is the HMAC signature below, which is the only thing standing between this
 * endpoint and anyone who finds the URL.
 *
 * ── Two different requests arrive here ───────────────────────────────────────
 * 1. The VERIFICATION handshake, once, when the URL is registered in the RBM
 *    console. Google POSTs `{ clientToken, secret }` and the endpoint must
 *    answer 200 with the raw secret as the body — not JSON, not quoted, the
 *    bare string. A JSON-wrapped secret fails verification with no explanation.
 *
 * 2. EVENTS, forever after, as Pub/Sub push: the real payload is base64 in
 *    `message.data`, and `X-Goog-Signature` is the base64 HMAC-SHA512 of those
 *    DECODED bytes, keyed by the client token.
 *
 * ── Why 200 on almost everything ─────────────────────────────────────────────
 * A non-2xx tells Pub/Sub to redeliver. That is right for "we failed to store
 * this" and wrong for "we cannot parse this" — a permanently malformed event
 * would otherwise be retried for days. So parse failures are logged and
 * acknowledged; only storage failures ask for redelivery. A rejected signature
 * gets 403 and is never retried, which is what should happen to a forgery.
 *
 * Node runtime — needs crypto.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { RCS_CLIENT_TOKEN } from '@/lib/rcs/config';

export const runtime = 'nodejs';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Constant-time compare of two base64 signatures.
 *
 * `===` on a signature leaks its correct prefix through timing. That is a real
 * attack on an endpoint an attacker can call as often as they like, and the fix
 * costs nothing.
 */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  // timingSafeEqual throws on length mismatch, which is itself a leak-free
  // answer — different lengths cannot be equal.
  return a.length === b.length && timingSafeEqual(a, b);
}

interface ServerEvent {
  eventId?:     string;
  eventType?:   string;
  messageId?:   string;
  senderPhoneNumber?: string;
  sendTime?:    string;
  text?:        string;
  suggestionResponse?: { postbackData?: string; text?: string };
  userStatus?:  { isTyping?: boolean };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Not JSON at all. Acknowledge so it is not redelivered forever.
    return new NextResponse('ok', { status: 200 });
  }

  // ── 1. Verification handshake ──────────────────────────────────────────────
  if (typeof parsed.secret === 'string' && typeof parsed.clientToken === 'string') {
    if (!RCS_CLIENT_TOKEN) {
      console.error('[rcs] webhook handshake arrived but RCS_CLIENT_TOKEN is not set');
      return new NextResponse('not configured', { status: 503 });
    }
    if (parsed.clientToken !== RCS_CLIENT_TOKEN) {
      return new NextResponse('forbidden', { status: 403 });
    }
    // The raw secret, as text. Wrapping it in JSON is the classic failure here.
    return new NextResponse(parsed.secret, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // ── 2. Event ───────────────────────────────────────────────────────────────
  if (!RCS_CLIENT_TOKEN) {
    console.error('[rcs] webhook event arrived but RCS_CLIENT_TOKEN is not set — cannot verify');
    return new NextResponse('not configured', { status: 503 });
  }

  const message = parsed.message as { data?: string } | undefined;
  if (!message?.data) return new NextResponse('ok', { status: 200 });

  const decoded = Buffer.from(message.data, 'base64');

  const received = req.headers.get('x-goog-signature');
  if (!received) return new NextResponse('missing signature', { status: 403 });

  const expected = createHmac('sha512', RCS_CLIENT_TOKEN).update(decoded).digest('base64');
  if (!signatureMatches(expected, received)) {
    console.error('[rcs] webhook signature mismatch — payload rejected');
    return new NextResponse('bad signature', { status: 403 });
  }

  let event: ServerEvent;
  try {
    event = JSON.parse(decoded.toString('utf8')) as ServerEvent;
  } catch {
    return new NextResponse('ok', { status: 200 });
  }

  // Typing indicators are high-volume and carry nothing worth storing.
  if (event.userStatus?.isTyping) return new NextResponse('ok', { status: 200 });

  const supabase = db();

  // Google's messageId is our own row id — we chose it on send — so a receipt
  // links straight back with no lookup table. Guarded: a malformed id must not
  // fail the insert of an event we already accepted.
  const messageId = /^[0-9a-f-]{36}$/i.test(event.messageId ?? '') ? event.messageId! : null;

  const { error } = await supabase.from('ir_rcs_events').insert({
    event_id:   event.eventId ?? null,
    event_type: event.eventType ?? null,
    phone:      event.senderPhoneNumber ?? null,
    message_id: messageId,
    text:       event.text ?? event.suggestionResponse?.text ?? null,
    postback:   event.suggestionResponse?.postbackData ?? null,
    payload:    event as unknown as Record<string, unknown>,
  });

  // 23505 is the unique violation on event_id: this exact event has already
  // been stored. Pub/Sub is at-least-once, so that is expected traffic, not a
  // problem — acknowledge it so it stops being redelivered.
  if (error && error.code !== '23505') {
    console.error('[rcs] failed to store event:', error.message);
    return new NextResponse('storage failed', { status: 500 });   // ask for redelivery
  }

  // Advance the outbound row. DELIVERED and READ only ever move forward, so a
  // receipt arriving out of order cannot walk a read message back to delivered.
  if (messageId && event.eventType) {
    const now = new Date().toISOString();
    if (event.eventType === 'DELIVERED') {
      await supabase.from('ir_rcs_messages')
        .update({ status: 'delivered', delivered_at: now })
        .eq('id', messageId).in('status', ['queued', 'sent']);
    } else if (event.eventType === 'READ') {
      await supabase.from('ir_rcs_messages')
        .update({ status: 'read', read_at: now })
        .eq('id', messageId).in('status', ['queued', 'sent', 'delivered']);
    }
  }

  return new NextResponse('ok', { status: 200 });
}
