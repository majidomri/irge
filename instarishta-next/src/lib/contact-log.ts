export interface ContactEntry {
  id: string;
  type: 'whatsapp' | 'call';
  number: string;
  profileNum: number;
  profileTitle: string;
  timestamp: string;
}

const KEY = 'ir_contact_log';
const MAX = 300;

export function logContact(entry: Omit<ContactEntry, 'id' | 'timestamp'>): void {
  try {
    const existing = getContacts();
    const next: ContactEntry = {
      ...entry,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
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

export function clearContacts(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
