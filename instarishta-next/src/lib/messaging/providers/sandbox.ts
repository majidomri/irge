/**
 * The sandbox provider. Nothing leaves the server.
 *
 * It exists so the whole platform — templates, audiences, compliance, campaign
 * runner, receipts, opt-outs — can be exercised end to end before Ojiva's API
 * details are in, and so a change to any of that can be tried later without
 * texting anyone. It is used whenever no real provider is selected, and the
 * panel labels it on every screen that could otherwise be mistaken for live.
 *
 * Deterministic outcomes, by the last digits of the number, so a test can
 * choose what happens:
 *   …0000  → provider rejects it
 *   …1111  → RCS unreachable
 *   …2222  → accepted, then the operator reports it undelivered
 *   anything else → accepted, delivered (and read, for RCS)
 */
import type { MessagingProvider, NormalizedEvent, SubmitOutcome, SubmitRequest } from '../types';

export const sandbox: MessagingProvider = {
  id:    'sandbox',
  label: 'Sandbox (simulated — nothing is sent)',

  readiness() {
    return { ready: true, reachesPhones: false, missing: [], notes: ['Simulated delivery. No message reaches a phone.'] };
  },

  async submit(r: SubmitRequest): Promise<SubmitOutcome> {
    if (r.phone.endsWith('0000')) return { status: 'failed', fatal: false, code: 'SANDBOX_REJECT', error: 'Sandbox: rejected (number ends 0000)' };
    if (r.channel === 'rcs' && r.phone.endsWith('1111')) return { status: 'unreachable', error: 'Sandbox: RCS not enabled (number ends 1111)' };
    return { status: 'submitted', providerMessageId: `sbx-${r.messageId.slice(0, 8)}` };
  },

  simulateReceipts(r: SubmitRequest, outcome: SubmitOutcome): NormalizedEvent[] {
    if (outcome.status !== 'submitted') return [];
    const base = { messageId: r.messageId, providerMessageId: outcome.providerMessageId, phone: r.phone, text: null };
    if (r.phone.endsWith('2222')) {
      return [{ ...base, dedupeKey: `sandbox:${r.messageId}:failed`, type: 'failed', error: 'Sandbox: UNDELIV (number ends 2222)', raw: { simulated: true } }];
    }
    const events: NormalizedEvent[] = [
      { ...base, dedupeKey: `sandbox:${r.messageId}:delivered`, type: 'delivered', error: null, raw: { simulated: true } },
    ];
    if (r.channel === 'rcs') {
      events.push({ ...base, dedupeKey: `sandbox:${r.messageId}:read`, type: 'read', error: null, raw: { simulated: true } });
    }
    return events;
  },

  // The sandbox's receipts come from simulateReceipts, in-process. Its public
  // webhook refuses everything: a URL that accepted unauthenticated receipts
  // would let anyone mark messages delivered.
  parseWebhook() {
    return { authorized: false, events: [] };
  },
};
