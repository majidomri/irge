/**
 * Webhook plumbing shared by every provider.
 *
 * Indian aggregators do not agree on a delivery-report format. Some POST JSON,
 * some POST a form, some call a GET URL with query parameters; some send one
 * receipt, some an array; the message id is `msgid`, `messageId`, `request_id`
 * or `uuid` depending on who built it. So receipts are read leniently, from a
 * list of known field names, and the raw payload is always stored — when a
 * mapping turns out to be wrong, the evidence to fix it is already in the table.
 */
import { createHash, timingSafeEqual } from 'crypto';
import type { NormalizedEvent, NormalizedEventType, WebhookInput } from '../types';

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Every record the request carries, whatever the transport. */
export function readRecords(input: WebhookInput): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const ct = input.headers.get('content-type') ?? '';

  if (input.rawBody) {
    if (ct.includes('application/x-www-form-urlencoded')) {
      out.push(Object.fromEntries(new URLSearchParams(input.rawBody)));
    } else {
      try {
        const parsed = JSON.parse(input.rawBody) as unknown;
        const pick = (v: unknown) => { if (v && typeof v === 'object') out.push(v as Record<string, unknown>); };
        if (Array.isArray(parsed)) parsed.forEach(pick);
        else if (parsed && typeof parsed === 'object') {
          const p = parsed as Record<string, unknown>;
          // Batched shapes: { data: [...] }, { reports: [...] }, { results: [...] }
          const list = [p.data, p.reports, p.results, p.statuses, p.events].find(Array.isArray) as unknown[] | undefined;
          if (list) list.forEach(pick); else out.push(p);
        }
      } catch { /* not JSON — fall through to the query string */ }
    }
  }

  if (out.length === 0) {
    const q = Object.fromEntries(input.query);
    delete q.token; delete q.key;                     // the auth, not the data
    if (Object.keys(q).length) out.push(q);
  }
  return out;
}

function first(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  // One level of nesting is common: { message: { id } }, { dlr: { status } }.
  for (const v of Object.values(rec)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const hit = first(v as Record<string, unknown>, keys);
      if (hit) return hit;
    }
  }
  return null;
}

const ID_KEYS     = ['messageId', 'message_id', 'msgid', 'msgId', 'msg_id', 'uuid', 'request_id', 'requestId', 'transactionId', 'txnid', 'id'];
const REF_KEYS    = ['clientRef', 'client_ref', 'reference', 'ref', 'customId', 'custom_id', 'custom', 'correlationId', 'correlation_id', 'externalId', 'external_id'];
const STATUS_KEYS = ['status', 'deliveryStatus', 'delivery_status', 'dlrStatus', 'dlr_status', 'eventType', 'event_type', 'event', 'state'];
const PHONE_KEYS  = ['mobile', 'msisdn', 'to', 'number', 'phone', 'recipient', 'destination', 'from', 'senderPhoneNumber'];
const TEXT_KEYS   = ['text', 'body', 'message', 'content', 'reply'];
const ERROR_KEYS  = ['error', 'errorDescription', 'error_description', 'reason', 'description', 'errorCode', 'error_code', 'cause'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map whatever vocabulary the provider uses onto ours. */
export function mapStatus(raw: string | null): NormalizedEventType {
  const s = (raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return 'unknown';
  if (['delivered', 'delivrd', 'deliverysuccess', 'success', 'dlvd'].includes(s)) return 'delivered';
  if (['read', 'seen', 'displayed'].includes(s))                                  return 'read';
  if (['sent', 'submitted', 'acceptd', 'accepted', 'enroute', 'queued', 'senttooperator'].includes(s)) return 'sent';
  if (['notrcs', 'rcsnotenabled', 'unreachable', 'notcapable'].includes(s))       return 'unreachable';
  if (['reply', 'inbound', 'mo', 'message', 'userreply', 'suggestionresponse'].includes(s)) return 'reply';
  if (/fail|undeliv|rejec|expire|invalid|dnd|blocked|error|undelivered|deleted/.test(s)) return 'failed';
  return 'unknown';
}

export function normalizeRecord(provider: string, rec: Record<string, unknown>): NormalizedEvent {
  const ref   = first(rec, REF_KEYS);
  const pid   = first(rec, ID_KEYS);
  const type  = mapStatus(first(rec, STATUS_KEYS));
  const phone = first(rec, PHONE_KEYS);

  // Our id comes back as the client reference when the provider supports one;
  // some echo it as the message id itself.
  const messageId = ref && UUID.test(ref) ? ref : pid && UUID.test(pid) ? pid : null;

  // Dedupe on the provider's own event id when there is one, otherwise on the
  // content: the same receipt redelivered hashes to the same key.
  const eventId = first(rec, ['eventId', 'event_id', 'dlrId', 'dlr_id']);
  const dedupeKey = `${provider}:` + (eventId
    ?? createHash('sha256').update(JSON.stringify([pid, ref, type, phone, first(rec, ['timestamp', 'time', 'deliveredAt', 'done_date', 'sendTime'])])).digest('hex'));

  return {
    dedupeKey,
    type,
    messageId,
    providerMessageId: pid && pid !== messageId ? pid : null,
    phone,
    text:  type === 'reply' ? first(rec, TEXT_KEYS) : null,
    error: type === 'failed' ? first(rec, ERROR_KEYS) : null,
    raw:   rec,
  };
}

/**
 * The shared-secret check most aggregators support: a token in the callback
 * URL you register (`?token=…`) or in a header. Not as strong as a signature,
 * which is why a provider that signs should verify that instead.
 */
export function tokenAuthorized(input: WebhookInput, secret: string): boolean {
  if (!secret) return false;
  const candidates = [
    input.query.get('token'),
    input.query.get('key'),
    input.headers.get('x-webhook-secret'),
    input.headers.get('x-webhook-token'),
    input.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
  ].filter((v): v is string => !!v);
  return candidates.some(c => safeEqual(c, secret));
}
