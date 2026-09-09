/**
 * The contacted history, as the browser sees it.
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 * This module used to BE the storage: a JSON array in localStorage under
 * 'ir_contact_log_v1', capped at 300 entries. That put a member's whole record
 * of what they had spent credits on inside one browser — invisible on their
 * phone, and destroyed by clearing site data, with nothing on the server to
 * restore it from. ir_user_usage recorded only `feature: 'contact'`: no
 * profile, no number, no receipt.
 *
 * The rows now live in ir_contact_log (migration 033) and this file is a thin
 * client over /api/account/contacts. The exported shape is deliberately close
 * to the old one so the page rendering it did not have to change with it.
 *
 * ── The old key is not read ──────────────────────────────────────────────────
 * There is no import of 'ir_contact_log_v1' into the server. It cannot be
 * trusted — anyone can type any history into their own localStorage, and this
 * table is meant to be evidence of what was actually spent. Existing entries
 * stay visible in that browser only until it is cleared, and nothing new is
 * written there.
 */

export interface ContactEntry {
  id:           string;
  type:         'whatsapp' | 'call';
  number:       string;
  /** Upstream feed id — stable across feed edits, unlike profileNum. */
  profileId?:   number | null;
  /** Catalogue position as shown at the time. */
  profileNum:   number;
  profileTitle: string;
  timestamp:    string;
  revealed:     boolean;
}

/** Mask number — show only last 4 digits. e.g. +918886667121 → +91XXXXXXX7121 */
export function maskNumber(number: string): string {
  if (number.length <= 4) return number;
  const visible = number.slice(-4);
  const prefix  = number.slice(0, 3);   // e.g. +91
  const masked  = 'X'.repeat(Math.max(0, number.length - 7));
  return `${prefix}${masked}${visible}`;
}

/**
 * Record one contact reveal.
 *
 * Fire-and-forget, exactly as the localStorage write was: the member is being
 * sent to WhatsApp in the same gesture, and a failed log must not hold that up
 * or surface an error over it. The failure is logged, not shown.
 */
export function logContact(
  entry: Pick<ContactEntry, 'type' | 'number' | 'profileNum' | 'profileTitle'> & { profileId?: number | null },
): void {
  fetch('/api/account/contacts', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(entry),
    keepalive: true,   // the tap opens a new tab; the request must outlive it
  }).catch((err) => console.error('[contact-log] failed to record contact:', err));
}

/**
 * The member's history, with the entries whose number should be shown in full
 * exactly once on this render.
 *
 * Both halves come from a single request: the server flips the reveal flags in
 * one `UPDATE ... RETURNING` and hands back the ids it flipped, so two tabs
 * opening /contacted at once cannot both claim to be the first — which the
 * three-step localStorage version could.
 */
export async function fetchContacts(): Promise<{ entries: ContactEntry[]; freshIds: Set<string> }> {
  try {
    const res = await fetch('/api/account/contacts', { cache: 'no-store' });
    if (!res.ok) return { entries: [], freshIds: new Set() };
    const data = await res.json() as { entries?: ContactEntry[]; freshIds?: string[] };
    return {
      entries:  data.entries ?? [],
      freshIds: new Set(data.freshIds ?? []),
    };
  } catch (err) {
    console.error('[contact-log] failed to load history:', err);
    return { entries: [], freshIds: new Set() };
  }
}
