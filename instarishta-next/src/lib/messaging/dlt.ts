/**
 * DLT templates: parsing, filling, and measuring.
 *
 * PURE — no server imports — because the admin composer previews with exactly
 * this code. A preview computed by a second implementation is a preview that
 * disagrees with the send path on the one message where it matters.
 *
 * ── The rule this file exists to enforce ────────────────────────────────────
 * An approved DLT template is fixed text with `{#var#}` slots. What goes out
 * must be that text with only the slots different. The operator's scrubber
 * compares them, and a mismatch is not bounced back as an error — it is
 * dropped, and the provider may still report it "submitted". So the only safe
 * composer is one that cannot produce anything else: the admin fills slots,
 * never the text.
 */

export type Channel  = 'sms' | 'rcs';
export type Category = 'promotional' | 'transactional' | 'service_implicit' | 'service_explicit';

export const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: 'promotional',      label: 'Promotional',        hint: 'Marketing. Consent required, 9am–9pm only, DND-scrubbed.' },
  { value: 'transactional',    label: 'Transactional',      hint: 'Banking-grade OTP/alerts. Rarely right for a matrimony site.' },
  { value: 'service_implicit', label: 'Service (implicit)', hint: 'About something the member did: payment received, interest accepted.' },
  { value: 'service_explicit', label: 'Service (explicit)', hint: 'Updates the member opted into. Consent + opt-out honoured.' },
];

/** Categories that need the member's opt-in and respect a STOP. */
export const needsConsent = (c: Category) => c === 'promotional' || c === 'service_explicit';

export interface TemplateVariable {
  /** Stable key, used in campaign variable maps. */
  key:    string;
  /** What the admin sees next to the input. */
  label:  string;
  /** Filled in previews and test sends when nothing else is given. */
  sample?: string;
  /** Characters allowed in this slot. DLT's default for {#var#} is 30. */
  max?:   number;
}

/** DLT's per-variable ceiling, unless the template was approved with more. */
export const DEFAULT_VAR_MAX = 30;

const SLOT = /\{#var#\}/gi;

/** How many `{#var#}` slots the approved text has. */
export function countSlots(body: string): number {
  return (body.match(SLOT) ?? []).length;
}

/**
 * Tokens that resolve per recipient, when a campaign variable is set to one.
 * Everything else is used literally.
 */
export const RECIPIENT_TOKENS = ['{first_name}', '{name}'] as const;

export interface RecipientContext {
  name?: string | null;
}

function resolveToken(value: string, r: RecipientContext | undefined): string {
  const name = (r?.name ?? '').trim();
  if (value === '{name}')       return name || 'Member';
  if (value === '{first_name}') return name.split(/\s+/)[0] || 'Member';
  return value;
}

export interface RenderResult {
  ok:       boolean;
  text:     string;
  /** In slot order — what providers that take positional variables want. */
  values:   string[];
  problems: string[];
}

/**
 * Fill the template.
 *
 * Every problem is returned, not the first: a campaign author fixing one error
 * per round trip gives up by the third.
 */
export function renderTemplate(
  body: string,
  variables: TemplateVariable[],
  given: Record<string, string>,
  recipient?: RecipientContext,
  opts: { useSamples?: boolean } = {},
): RenderResult {
  const problems: string[] = [];
  const slots = countSlots(body);

  if (slots !== variables.length) {
    problems.push(`The approved text has ${slots} {#var#} slot${slots === 1 ? '' : 's'} but ${variables.length} variable${variables.length === 1 ? ' is' : 's are'} defined`);
  }

  const values = variables.map((v) => {
    let raw = given[v.key];
    if ((raw === undefined || raw === '') && opts.useSamples) raw = v.sample ?? '';
    raw = resolveToken(String(raw ?? ''), recipient);

    const max = v.max ?? DEFAULT_VAR_MAX;
    // A recipient's own name is the one value an admin cannot see in advance.
    // Trimming it is better than skipping that member for having a long name.
    if (raw.length > max && RECIPIENT_TOKENS.includes(given[v.key] as typeof RECIPIENT_TOKENS[number])) {
      raw = raw.slice(0, max);
    }

    if (!raw.trim())          problems.push(`“${v.label}” is empty`);
    if (raw.length > max)     problems.push(`“${v.label}” is ${raw.length} characters; the approved limit is ${max}`);
    if (/[\r\n]/.test(raw))   problems.push(`“${v.label}” contains a line break, which changes the approved text`);
    return raw;
  });

  let i = 0;
  const text = body.replace(SLOT, () => values[i++] ?? '');

  return { ok: problems.length === 0, text, values, problems };
}

// ── Segments ──────────────────────────────────────────────────────────────────

const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export interface SegmentInfo {
  encoding: 'GSM-7' | 'Unicode';
  units:    number;
  segments: number;
  perSegment: number;
}

/**
 * How many billable SMS parts a text is.
 *
 * Worth showing because it is invisible otherwise: one ₹ or one Hindi word
 * switches the whole message to Unicode and cuts each part from 160 to 70
 * characters, which can triple the cost of a campaign without a visible change.
 */
export function measureSms(text: string): SegmentInfo {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM7.includes(ch))          units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else { unicode = true; break; }
  }

  if (unicode) {
    const len = [...text].length;
    const per = len <= 70 ? 70 : 67;
    return { encoding: 'Unicode', units: len, perSegment: per, segments: Math.max(1, Math.ceil(len / per)) };
  }
  const per = units <= 160 ? 160 : 153;
  return { encoding: 'GSM-7', units, perSegment: per, segments: Math.max(1, Math.ceil(units / per)) };
}

// ── Numbers ───────────────────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{7,14}$/;

/** Same normalisation as lib/rcs/config — duplicated because that file is server-side. */
export function toE164(raw: string, defaultCc = '+91'): string | null {
  const t = (raw ?? '').replace(/[\s()\-.]/g, '');
  if (!t) return null;
  if (t.startsWith('+'))  return E164.test(t) ? t : null;
  if (t.startsWith('00')) { const p = '+' + t.slice(2); return E164.test(p) ? p : null; }
  if (/^91[6-9]\d{9}$/.test(t)) return '+' + t;
  if (/^0?[6-9]\d{9}$/.test(t)) return defaultCc + t.replace(/^0/, '');
  return null;
}

/** Split a pasted list — newlines, commas, semicolons — into unique E.164 numbers. */
export function parseNumbers(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)) {
    const n = toE164(part);
    if (!n) { invalid.push(part); continue; }
    if (!seen.has(n)) { seen.add(n); valid.push(n); }
  }
  return { valid, invalid };
}

/** The DLT portal issues 19-digit ids for entities and templates. */
export const DLT_ID = /^\d{19}$/;

/**
 * A sender header. Indian headers are normally 6 characters (alphabetic for
 * service/transactional, often numeric for promotional); the check is loose
 * on purpose, since the DLT portal — not this form — is the authority.
 */
export const SMS_HEADER = /^[A-Z0-9]{3,11}$/;

// ── Time window ───────────────────────────────────────────────────────────────

/** The current hour in India, 0–23. */
export function istHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
}

/**
 * The next moment promotional traffic may go out, or null if it may go now.
 *
 * TRAI's window is 09:00–21:00; settings may narrow it but never widen it.
 */
export function nextPromoWindow(start: number, end: number, now = new Date()): Date | null {
  const s = Math.max(9, start);
  const e = Math.min(21, end);
  const h = istHour(now);
  if (h >= s && h < e) return null;

  // Build "today at s:00 IST" in UTC. IST is a fixed +05:30 with no DST.
  const istNow   = new Date(now.getTime() + 330 * 60_000);
  const target   = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), s, 0, 0));
  if (h >= e) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - 330 * 60_000);
}
