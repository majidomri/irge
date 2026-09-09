/**
 * The three RCS Business Messaging calls this app makes.
 *
 * Everything is a plain fetch against the regional endpoint. See config.ts for
 * why there is no vendor SDK and what has to be approved before any of this
 * returns anything but an error.
 */
import { randomUUID } from 'crypto';
import { rcsAccessToken } from './auth';
import { RCS_AGENT_ID, rcsBaseUrl, rcsReadiness } from './config';
import { buildAgentMessage, type RcsPayload, type TrafficType } from './messages';

export type SendOutcome =
  | { status: 'sent';         messageId: string }
  | { status: 'unreachable' }
  | { status: 'dry_run';      messageId: string }
  | { status: 'failed';       error: string; httpStatus?: number };

/**
 * Is this number reachable by our agent right now?
 *
 * A 404 is the documented "not reachable" answer, and it covers two different
 * facts the API deliberately does not separate: the handset has no RCS, or our
 * agent is not launched on that person's carrier. Both mean "do not send", so
 * collapsing them is fine — but it is why a 404 here is NOT an error.
 */
export async function checkCapability(phone: string): Promise<{ reachable: boolean; features: string[]; error?: string }> {
  if (!rcsReadiness().ready) return { reachable: false, features: [], error: 'RCS is not configured' };

  try {
    const token = await rcsAccessToken();
    const url = `${rcsBaseUrl()}/phones/${encodeURIComponent(phone)}/capabilities`
      + `?requestId=${randomUUID()}&agentId=${encodeURIComponent(RCS_AGENT_ID)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache:   'no-store',
      signal:  AbortSignal.timeout(15_000),
    });

    if (res.status === 404) return { reachable: false, features: [] };

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { reachable: false, features: [], error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }

    const body = await res.json() as { features?: string[] };
    return { reachable: true, features: body.features ?? [] };
  } catch (e) {
    return { reachable: false, features: [], error: (e as Error).message };
  }
}

/**
 * Send one message.
 *
 * `messageId` is supplied BY US, not by Google, and that is the whole
 * idempotency story: retrying with the same id is a no-op rather than a second
 * message. So the caller generates it, stores it, and reuses it on retry — see
 * the send route, which writes the row before the call rather than after.
 *
 * `dryRun` renders and validates the exact request without dispatching it. It
 * is the default in the admin UI, because the failure mode of this API is
 * sending to real people and there is no unsend.
 */
export async function sendMessage(opts: {
  phone:     string;
  payload:   RcsPayload;
  traffic:   TrafficType;
  messageId: string;
  dryRun?:   boolean;
}): Promise<SendOutcome> {
  const { phone, payload, traffic, messageId, dryRun } = opts;

  if (dryRun) return { status: 'dry_run', messageId };

  const readiness = rcsReadiness();
  if (!readiness.ready) {
    return { status: 'failed', error: `RCS is not configured — missing ${readiness.missing.join(', ')}` };
  }

  try {
    const token = await rcsAccessToken();
    const url = `${rcsBaseUrl()}/phones/${encodeURIComponent(phone)}/agentMessages`
      + `?messageId=${encodeURIComponent(messageId)}&agentId=${encodeURIComponent(RCS_AGENT_ID)}`;

    const res = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildAgentMessage(payload, traffic)),
      cache:   'no-store',
      signal:  AbortSignal.timeout(30_000),
    });

    if (res.ok) return { status: 'sent', messageId };

    // 404 on a SEND means the same thing it means on a capability check: this
    // person cannot receive from us. It is an outcome, not a fault, and it must
    // not abort a campaign the way a 401 or a 429 should.
    if (res.status === 404) return { status: 'unreachable' };

    const body = await res.text().catch(() => '');
    return { status: 'failed', httpStatus: res.status, error: `HTTP ${res.status} ${body.slice(0, 300)}` };
  } catch (e) {
    return { status: 'failed', error: (e as Error).message };
  }
}

/**
 * Whether a failure is worth stopping the whole run for.
 *
 * A campaign that hits an expired credential should stop at message 1, not
 * grind through 500 identical 401s; one that hits a single malformed number
 * should skip it and continue. 429 stops too — continuing into a rate limit
 * just deepens it.
 */
export function isFatal(outcome: SendOutcome): boolean {
  if (outcome.status !== 'failed') return false;
  const s = outcome.httpStatus;
  if (s === undefined) return false;              // network blip: retryable, not fatal
  return s === 401 || s === 403 || s === 429 || s >= 500;
}
