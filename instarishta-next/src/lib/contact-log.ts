export interface ContactEntry {
  id:           string;
  type:         'whatsapp' | 'call';
  number:       string;
  profileNum:   number;
  profileTitle: string;
  timestamp:    string;
  revealed:     boolean; // true = full number shown once, then permanently masked
}

const KEY = 'ir_contact_log';
const MAX = 300;

/** Mask number — show only last 4 digits. e.g. +918886667121 → +91XXXXXXX7121 */
export function maskNumber(number: string): string {
  if (number.length <= 4) return number;
  const visible = number.slice(-4);
  const prefix  = number.slice(0, 3);   // e.g. +91
  const masked  = 'X'.repeat(Math.max(0, number.length - 7));
  return `${prefix}${masked}${visible}`;
}

export function logContact(entry: Omit<ContactEntry, 'id' | 'timestamp' | 'revealed'>): void {
  try {
    const existing = getContacts();
    const next: ContactEntry = {
      ...entry,
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      revealed:  true, // full number visible exactly once on next page load
    };
    localStorage.setItem(KEY, JSON.stringify([next, ...existing].slice(0, MAX)));
  } catch { /* storage full or unavailable */ }
}

export function getContacts(): ContactEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ContactEntry[];
  } catch {
    return [];
  }
}

/**
 * Mark all currently-revealed entries as masked and return two lists:
 * - freshIds: IDs that were revealed (show full number this render)
 * - entries:  all entries (already saved back with revealed=false)
 */
export function consumeRevealedNumbers(): { entries: ContactEntry[]; freshIds: Set<string> } {
  const entries  = getContacts();
  const freshIds = new Set(entries.filter(e => e.revealed).map(e => e.id));

  if (freshIds.size > 0) {
    const updated = entries.map(e => e.revealed ? { ...e, revealed: false } : e);
    try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    return { entries: updated, freshIds };
  }
  return { entries, freshIds };
}
