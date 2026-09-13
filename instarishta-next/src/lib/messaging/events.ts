/**
 * Receipts and replies, applied to the log.
 *
 * Two properties this has to have, because webhooks guarantee neither order
 * nor uniqueness:
 *
 *   • Idempotent — the event row's dedupe_key is unique, and a duplicate is
 *     acknowledged without touching the message again.
 *   • Monotonic — status only moves forward. A 'sent' arriving after
 *     'delivered' cannot walk the message back.
 */
import 'server-only';

import type { AdminDb } from '@/lib/admin-route';
import type { MessageStatus, NormalizedEvent } from './types';

/** Higher wins. Terminal failures sit beside delivery, not above it. */
const RANK: Record<MessageStatus, number> = {
  dry_run: 0, skipped: 0, queued: 1, submitted: 2, sent: 3,
  failed: 4, unreachable: 4, delivered: 5, read: 6,
};

const STOP_WORDS = /^\s*(stop|unsubscribe|optout|opt[\s-]?out|cancel|end|quit)\b/i;

export async function ingestEvents(db: AdminDb, provider: string, events: NormalizedEvent[]) {
  let stored = 0, duplicates = 0, applied = 0, optouts = 0;

  for (const e of events) {
    // Resolve our row: by our id when echoed, otherwise by the provider's id.
    let messageId = e.messageId;
    if (!messageId && e.providerMessageId) {
      const { data } = await db.from('ir_msg_messages').select('id')
        .eq('provider_message_id', e.providerMessageId).limit(1).maybeSingle();
      messageId = (data as { id: string } | null)?.id ?? null;
    }

    const { error } = await db.from('ir_msg_events').insert({
      provider,
      dedupe_key:          e.dedupeKey,
      event_type:          e.type,
      message_id:          messageId,
      provider_message_id: e.providerMessageId,
      phone:               e.phone,
      text:                e.text,
      error:               e.error,
      payload:             e.raw,
    });

    if (error?.code === '23505') { duplicates++; continue; }
    if (error) throw new Error(`event insert: ${error.message}`);
    stored++;

    // A STOP reply withdraws consent for that number, whichever channel it came on.
    if (e.type === 'reply' && e.phone && e.text && STOP_WORDS.test(e.text)) {
      const phone = e.phone.startsWith('+') ? e.phone : `+${e.phone.replace(/^0+/, '')}`;
      await db.from('ir_msg_optouts').upsert(
        { phone, source: 'reply', reason: e.text.slice(0, 80) },
        { onConflict: 'phone', ignoreDuplicates: true },
      );
      optouts++;
    }

    if (!messageId) continue;
    const next: MessageStatus | null =
      e.type === 'delivered'   ? 'delivered'
      : e.type === 'read'      ? 'read'
      : e.type === 'failed'    ? 'failed'
      : e.type === 'unreachable' ? 'unreachable'
      : e.type === 'sent'      ? 'sent'
      : null;
    if (!next) continue;

    const { data: row } = await db.from('ir_msg_messages').select('status').eq('id', messageId).maybeSingle();
    const current = (row as { status: MessageStatus } | null)?.status;
    if (!current || RANK[next] <= RANK[current]) continue;
    // A failure receipt after a delivery receipt is noise; delivery stands.
    if (next === 'failed' && (current === 'delivered' || current === 'read')) continue;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: next };
    if (next === 'delivered') patch.delivered_at = now;
    if (next === 'read')      { patch.read_at = now; }
    if (next === 'failed' || next === 'unreachable') patch.error = e.error ?? 'Reported by operator';

    await db.from('ir_msg_messages').update(patch).eq('id', messageId).eq('status', current);
    applied++;
  }

  return { stored, duplicates, applied, optouts };
}
