/**
 * Ojiva AI "Nexus" — SMS and RCS over Jio.
 *
 * ── The request contract is NOT yet confirmed ────────────────────────────────
 * Ojiva's API reference is behind the Nexus login (docs.ojiva.ai does not
 * resolve publicly). Everything that depends on their exact wire format is in
 * the two `build…Body` functions and `readSubmitResponse` below, and nowhere
 * else. When the docs arrive, those three functions and the env paths are the
 * whole change.
 *
 * Until then the adapter REFUSES to submit unless OJIVA_CONTRACT_VERIFIED=1.
 * A guessed field name does not fail loudly: an aggregator that ignores an
 * unknown `dlt_template_id` key may still accept the message and let the
 * operator drop it, and the log would say "submitted". So the guard is on, and
 * the admin panel says so, until someone has sent a real test through it.
 *
 * ── Environment ─────────────────────────────────────────────────────────────
 *   OJIVA_API_BASE           https://… (no trailing slash)
 *   OJIVA_API_KEY            the key from Nexus
 *   OJIVA_AUTH_STYLE         bearer (default) | header:<Header-Name> | query:<param>
 *   OJIVA_SMS_PATH           e.g. /v1/sms/send
 *   OJIVA_RCS_PATH           e.g. /v1/rcs/send
 *   OJIVA_WEBHOOK_SECRET     token appended to the callback URL you register
 *   OJIVA_CONTRACT_VERIFIED  1 once a real test message has been confirmed on a handset
 */
import type {
  MessagingProvider, NormalizedEvent, ProviderReadiness, SubmitOutcome, SubmitRequest, WebhookInput,
} from '../types';
import { normalizeRecord, readRecords, tokenAuthorized } from './common';

const env = (k: string) => process.env[k]?.trim() ?? '';

function config() {
  return {
    base:     env('OJIVA_API_BASE').replace(/\/+$/, ''),
    key:      env('OJIVA_API_KEY'),
    auth:     env('OJIVA_AUTH_STYLE') || 'bearer',
    smsPath:  env('OJIVA_SMS_PATH'),
    rcsPath:  env('OJIVA_RCS_PATH'),
    secret:   env('OJIVA_WEBHOOK_SECRET'),
    verified: env('OJIVA_CONTRACT_VERIFIED') === '1',
  };
}

// ── Contract-dependent: adjust these three to Ojiva's documentation ──────────

function buildSmsBody(r: SubmitRequest): Record<string, unknown> {
  return {
    sender:          r.senderCode,
    to:              r.phone.replace(/^\+/, ''),     // most Indian gateways want 91XXXXXXXXXX
    message:         r.text,
    type:            r.category === 'promotional' ? 'promotional' : 'transactional',
    unicode:         /[^\x00-\x7F]/.test(r.text),
    dlt_entity_id:   r.dltEntityId,
    dlt_template_id: r.dltTemplateId,
    reference:       r.messageId,
  };
}

function buildRcsBody(r: SubmitRequest): Record<string, unknown> {
  return {
    bot_id:      r.senderCode,
    to:          r.phone.replace(/^\+/, ''),
    template_id: r.providerTemplateId ?? r.dltTemplateId,
    variables:   r.values,
    // Plain text fallback and rich content; the aggregator uses whichever its
    // template type calls for.
    text:        r.text,
    content:     r.rcsPayload,
    reference:   r.messageId,
  };
}

/** Pull the provider's message id and a failure reason out of a 2xx body. */
function readSubmitResponse(body: unknown): { accepted: boolean; providerMessageId: string | null; error: string | null } {
  if (!body || typeof body !== 'object') return { accepted: true, providerMessageId: null, error: null };
  const b = body as Record<string, unknown>;
  const data = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;

  const id = [data.messageId, data.message_id, data.msgid, data.request_id, data.id, data.uuid]
    .find(v => typeof v === 'string' || typeof v === 'number');

  // Many gateways answer 200 with { status: "error" } — treat that as a failure.
  const status = String(b.status ?? b.type ?? '').toLowerCase();
  const hasError = b.error !== undefined && b.error !== null && b.error !== false;
  const failed   = b.success === false || hasError || ['error', 'failed', 'failure'].includes(status);

  return {
    accepted: !failed,
    providerMessageId: id !== undefined ? String(id) : null,
    error: failed ? String(b.message ?? b.error ?? b.description ?? 'Rejected by provider') : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function authorize(url: URL, headers: Record<string, string>, style: string, key: string) {
  if (style === 'bearer') { headers.Authorization = `Bearer ${key}`; return; }
  const [kind, name] = style.split(':');
  if (kind === 'header' && name) headers[name] = key;
  else if (kind === 'query' && name) url.searchParams.set(name, key);
  else headers.Authorization = `Bearer ${key}`;
}

export const ojiva: MessagingProvider = {
  id:    'ojiva',
  label: 'Ojiva Nexus (Jio)',

  readiness(): ProviderReadiness {
    const c = config();
    const missing: string[] = [];
    if (!c.base)    missing.push('OJIVA_API_BASE');
    if (!c.key)     missing.push('OJIVA_API_KEY');
    if (!c.smsPath) missing.push('OJIVA_SMS_PATH');
    if (!c.rcsPath) missing.push('OJIVA_RCS_PATH');
    if (!c.secret)  missing.push('OJIVA_WEBHOOK_SECRET');

    const notes: string[] = [];
    if (!c.verified) {
      notes.push('Request format not yet confirmed against Ojiva’s docs — sending is locked until OJIVA_CONTRACT_VERIFIED=1.');
    }
    return {
      ready: missing.filter(m => m !== 'OJIVA_WEBHOOK_SECRET').length === 0 && c.verified,
      reachesPhones: true,
      missing,
      notes,
    };
  },

  async submit(r: SubmitRequest): Promise<SubmitOutcome> {
    const c = config();
    if (!c.verified) {
      return { status: 'failed', fatal: true, error: 'Ojiva request format not confirmed (OJIVA_CONTRACT_VERIFIED is not 1)' };
    }
    const path = r.channel === 'sms' ? c.smsPath : c.rcsPath;
    if (!c.base || !c.key || !path) {
      return { status: 'failed', fatal: true, error: 'Ojiva is not configured' };
    }

    const url = new URL(c.base + path);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    authorize(url, headers, c.auth, c.key);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body:   JSON.stringify(r.channel === 'sms' ? buildSmsBody(r) : buildRcsBody(r)),
        cache:  'no-store',
        signal: AbortSignal.timeout(20_000),
      });

      const text = await res.text().catch(() => '');
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }

      if (res.status === 401 || res.status === 403) {
        return { status: 'failed', fatal: true, code: String(res.status), error: `Ojiva refused the credentials (HTTP ${res.status})` };
      }
      if (res.status === 429 || res.status >= 500) {
        return { status: 'failed', fatal: true, code: String(res.status), error: `Ojiva HTTP ${res.status} ${text.slice(0, 200)}` };
      }
      if (res.status === 404 && r.channel === 'rcs') {
        return { status: 'unreachable', error: text.slice(0, 200) };
      }
      if (!res.ok) {
        return { status: 'failed', fatal: false, code: String(res.status), error: `Ojiva HTTP ${res.status} ${text.slice(0, 300)}` };
      }

      const read = readSubmitResponse(body);
      if (!read.accepted) return { status: 'failed', fatal: false, error: read.error ?? 'Rejected' };
      return { status: 'submitted', providerMessageId: read.providerMessageId };
    } catch (e) {
      // A timeout may still have been accepted. Not fatal — but the row stays
      // honest about it (see dispatch.ts).
      return { status: 'failed', fatal: false, error: `Network: ${(e as Error).message}` };
    }
  },

  parseWebhook(input: WebhookInput): { authorized: boolean; events: NormalizedEvent[] } {
    const { secret } = config();
    if (!tokenAuthorized(input, secret)) return { authorized: false, events: [] };
    return { authorized: true, events: readRecords(input).map(r => normalizeRecord('ojiva', r)) };
  },
};
