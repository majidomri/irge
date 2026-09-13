/**
 * Who may be sent what, and when.
 *
 * Two kinds of check, kept apart on purpose:
 *
 *   templateProblems  — is this template sendable AT ALL? Wrong for everyone or
 *                       for no one, so it is a form error before anything is
 *                       queued, never 500 identical per-recipient skips.
 *
 *   recipientDecision — may THIS number receive it? Answered per recipient and
 *                       recorded as a skip reason, because "why didn't Ayesha
 *                       get it" deserves an answer on the row.
 *
 * The time window and the daily cap are checked by the runner at send time, not
 * here: a campaign built at 8pm and sent at 10am must be judged at 10am.
 */
import { needsConsent } from './dlt';
import type { Sender, Settings, Template } from './types';

export function templateProblems(t: Template, sender: Sender | null, s: Settings): string[] {
  const p: string[] = [];

  if (t.status !== 'approved') p.push(`Template is ${t.status}, not approved`);
  if (t.channel === 'sms' && !s.sms_enabled) p.push('SMS is switched off in settings');
  if (t.channel === 'rcs' && !s.rcs_enabled) p.push('RCS is switched off in settings');

  if (!sender)                          p.push('Template has no sender (header / bot) assigned');
  else {
    if (sender.status !== 'approved')   p.push(`Sender ${sender.sender_code} is ${sender.status}`);
    if (sender.channel !== t.channel)   p.push(`Sender ${sender.sender_code} is an ${sender.channel.toUpperCase()} sender, template is ${t.channel.toUpperCase()}`);
    // DLT registers headers per category. A promotional header carrying service
    // traffic, or the reverse, is scrubbed.
    const promoSender = sender.category === 'promotional';
    const promoTpl    = t.category === 'promotional';
    if (promoSender !== promoTpl) {
      p.push(`Sender ${sender.sender_code} is registered as ${sender.category.replace('_', ' ')}, template is ${t.category.replace('_', ' ')}`);
    }
  }

  if (t.channel === 'sms') {
    if (!s.dlt_entity_id)   p.push('DLT entity ID is not set (Settings)');
    if (!t.dlt_template_id) p.push('Template has no DLT template ID');
  }

  return p;
}

export type Decision = { ok: true } | { ok: false; reason: string };

export interface RecipientFacts {
  phone:     string;
  consented: boolean;   // member opted in
  optedOut:  boolean;   // STOP / admin block
}

export function recipientDecision(t: Template, s: Settings, r: RecipientFacts): Decision {
  // Test mode is absolute: while the carrier approval is a testing one, the
  // only phones that may ring are the ones listed as ours.
  if (s.mode === 'test' && !s.test_numbers.includes(r.phone)) {
    return { ok: false, reason: 'test mode — not a test number' };
  }

  if (needsConsent(t.category)) {
    if (r.optedOut)   return { ok: false, reason: 'opted out' };
    // Test numbers are the operator's own phones; consent is implied by listing them.
    const isTestNumber = s.test_numbers.includes(r.phone);
    if (!r.consented && !isTestNumber) return { ok: false, reason: 'no marketing consent' };
  }

  return { ok: true };
}
