/**
 * DLT templates: parsing, filling, and measuring.
 *
 * PURE — no server imports — because the admin composer previews with exactly
 * this code. A preview computed by a second implementation is a preview that
 * disagrees with the send path on the one message where it matters.
 *
 * ── The rule this file exists to enforce ────────────────────────────────────
 * An approved DLT template is fixed text with `{#…#}` slots. What goes out
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
  /** Characters allowed in this slot. DLT's default is 30. */
  max?:   number;
  /** The placeholder kind from the approved text: var, alp, num, url, cbn… */
  type?:  string;
}

/** DLT's per-variable ceiling, unless the template was approved with more. */
export const DEFAULT_VAR_MAX = 30;

/**
 * Every DLT placeholder form, not just `{#var#}`.
 *
 * Templates are approved with TYPED slots — the first InstaRishta template came
 * back as `{#alp#}` and `{#num#}` — and the operator checks the value against
 * the type. A number in an `{#alp#}` slot, or letters in `{#num#}`, is a
 * mismatch, and a message sent with the placeholder left literally in it was
 * refused with error 321 (Nexus delivery report, 2026-09-12).
 */
const SLOT_SOURCE = String.raw`\{#([a-z]+)#\}`;
const slotRe = () => new RegExp(SLOT_SOURCE, 'gi');

/** Human label and value check for each placeholder type. */
export const SLOT_TYPES: Record<string, { label: string; test?: RegExp; hint: string }> = {
  var:          { label: 'Any text',     hint: 'Any characters' },
  alp:          { label: 'Alphanumeric', test: /^[\p{L}\p{N} .,'&-]+$/u, hint: 'Letters, digits and spaces' },
  alphanumeric: { label: 'Alphanumeric', test: /^[\p{L}\p{N} .,'&-]+$/u, hint: 'Letters, digits and spaces' },
  num:          { label: 'Number',       test: /^[\d.,]+$/, hint: 'Digits only' },
  numeric:      { label: 'Number',       test: /^[\d.,]+$/, hint: 'Digits only' },
  url:          { label: 'URL',          test: /^\S+\.\S+$/, hint: 'A whitelisted link' },
  urlott:       { label: 'URL',          test: /^\S+\.\S+$/, hint: 'A whitelisted link' },
  cbn:          { label: 'Call-back no.', test: /^\+?[\d\s-]{10,15}$/, hint: 'A whitelisted number' },
  email:        { label: 'Email',        test: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, hint: 'An email address' },
};

/** The slot types in order of appearance, e.g. ['alp', 'num']. */
export function slotTypes(body: string): string[] {
  return [...body.matchAll(slotRe())].map(m => m[1].toLowerCase());
}

/** How many `{#…#}` slots the approved text has. */
export function countSlots(body: string): number {
  return slotTypes(body).length;
}

/**
 * Tokens that resolve per recipient, when a campaign variable is set to one.
 * `{col:<header>}` reads a column of an uploaded audience file.
 */
export const RECIPIENT_TOKENS = ['{first_name}', '{name}'] as const;

export interface RecipientContext {
  name?: string | null;
  /** Extra columns from an uploaded audience file, by lower-cased header. */
  cols?: Record<string, string>;
}

const isRecipientToken = (v: string | undefined) =>
  !!v && (RECIPIENT_TOKENS.includes(v as typeof RECIPIENT_TOKENS[number]) || /^\{col:[^}]+\}$/.test(v));

function resolveToken(value: string, r: RecipientContext | undefined): string {
  const name = (r?.name ?? '').trim();
  if (value === '{name}')       return name || 'Member';
  if (value === '{first_name}') return name.split(/\s+/)[0] || 'Member';
  const col = /^\{col:([^}]+)\}$/.exec(value);
  if (col) return (r?.cols?.[col[1].trim().toLowerCase()] ?? '').trim();
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
  const types = slotTypes(body);

  if (types.length !== variables.length) {
    problems.push(`The approved text has ${types.length} {#…#} slot${types.length === 1 ? '' : 's'} but ${variables.length} variable${variables.length === 1 ? ' is' : 's are'} defined`);
  }

  const values = variables.map((v, i) => {
    let raw = given[v.key];
    if ((raw === undefined || raw === '') && opts.useSamples) raw = v.sample ?? '';
    raw = resolveToken(String(raw ?? ''), recipient);

    const max = v.max ?? DEFAULT_VAR_MAX;
    // A value the admin cannot see in advance (a member's name, a file column)
    // is trimmed to fit rather than skipping that recipient.
    if (raw.length > max && isRecipientToken(given[v.key])) raw = raw.slice(0, max).trim();

    const type = SLOT_TYPES[types[i] ?? v.type ?? 'var'];
    if (!raw.trim())                      problems.push(`“${v.label}” is empty`);
    else if (type?.test && !type.test.test(raw)) problems.push(`“${v.label}” must be ${type.hint.toLowerCase()} ({#${types[i]}#}) — got “${raw}”`);
    if (raw.length > max)                 problems.push(`“${v.label}” is ${raw.length} characters; the approved limit is ${max}`);
    if (/[\r\n]/.test(raw))               problems.push(`“${v.label}” contains a line break, which changes the approved text`);
    if (/\{#[a-z]+#\}/i.test(raw))        problems.push(`“${v.label}” still contains a placeholder`);
    return raw;
  });

  let i = 0;
  const text = body.replace(slotRe(), () => values[i++] ?? '');

  return { ok: problems.length === 0, text, values, problems };
}

// ── Matching sent text back to a template ─────────────────────────────────────

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface TemplateMatch<T> { template: T; values: string[] }

/**
 * Which template a piece of sent text came from, and its slot values.
 *
 * Used on imported gateway reports: a message that matches no approved
 * template is exactly the kind the operator refuses, so "no match" is worth
 * showing even when the gateway said nothing. Whitespace runs are collapsed
 * on both sides; everything else must be identical.
 */
export function matchTemplate<T extends { body: string; variables: TemplateVariable[] }>(
  text: string, templates: T[],
): TemplateMatch<T> | null {
  const target = collapse(text);
  if (/\{#[a-z]+#\}/i.test(target)) return null;     // placeholders left in: matches nothing
  for (const t of templates) {
    const parts = collapse(t.body).split(slotRe());
    // split() with a capture group interleaves the slot types; keep the literal parts.
    const literals = parts.filter((_, idx) => idx % 2 === 0);
    const pattern = '^' + literals.map(escapeRe).join('(.+?)') + '$';
    const m = new RegExp(pattern, 's').exec(target);
    if (m) return { template: t, values: m.slice(1) };
  }
  return null;
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

// ── CTA whitelist ─────────────────────────────────────────────────────────────

export interface Cta {
  cta_type: 'url' | 'phone' | 'apk' | 'other';
  sub_type: 'static' | 'dynamic';
  value:    string;
  status:   'active' | 'inactive';
}

/**
 * TLDs a link in an SMS plausibly ends in. A list rather than "any letters
 * after a dot", because "Solutions.Thanks" in running text is not a URL and a
 * false positive here blocks a legitimate send.
 */
const TLDS = 'me|in|com|org|net|co|io|app|ly|gl|link|page|site|online|xyz|info|biz|shop|store|ai|to|cc|us|uk|gov|edu|ac';
const URL_RE   = new RegExp(`(?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)+(?:${TLDS})\\b(?:\\/[^\\s]*)?`, 'gi');
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?|0)?(?:[6-9]\d{4}[\s-]?\d{5}|1800[\s-]?\d{3}[\s-]?\d{4})(?!\d)/g;

/** Scheme stripped, host lower-cased, trailing slash and sentence punctuation dropped. */
export function normalizeUrl(u: string): string {
  const s = u.trim().replace(/[.,;:!?)\]'"]+$/, '').replace(/^https?:\/\//i, '');
  const slash = s.indexOf('/');
  const host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? '' : s.slice(slash);
  return (host + path).replace(/\/+$/, '');
}

const digits10 = (p: string) => p.replace(/\D/g, '').slice(-10);

export function extractCtas(text: string): { urls: string[]; phones: string[] } {
  const urls = [...new Set((text.match(URL_RE) ?? []).map(u => u.replace(/[.,;:!?)\]'"]+$/, '')))];
  const phones = [...new Set((text.match(PHONE_RE) ?? []).map(p => p.trim()))];
  return { urls, phones };
}

/**
 * Every link or call-back number in `text` that is not on the whitelist.
 *
 * Literal except for a leading `www.`: SMS saying "instarishta.me" were
 * delivered against the whitelisted https://www.instarishta.me/ (Nexus
 * delivery report, 2026-09-12), so the operator treats the two as one host.
 * Paths are still exact for a static CTA.
 */
export function ctaViolations(text: string, ctas: Cta[]): string[] {
  const active = ctas.filter(c => c.status === 'active');
  const { urls, phones } = extractCtas(text);
  const out: string[] = [];

  const urlCtas = active.filter(c => c.cta_type === 'url' || c.cta_type === 'apk');
  for (const u of urls) {
    const n = normalizeUrl(u).replace(/^www\./, '');
    const ok = urlCtas.some(c => {
      const v = normalizeUrl(c.value).replace(/^www\./, '');
      return c.sub_type === 'dynamic' ? n === v || n.startsWith(v + '/') || n.startsWith(v + '?') : n === v;
    });
    if (!ok) {
      const hint = urlCtas.length ? ` Whitelisted: ${urlCtas.map(c => c.value).join(', ')}` : ' No URLs are whitelisted yet.';
      out.push(`Link “${u}” is not a whitelisted CTA — the operator will block this SMS.${hint}`);
    }
  }

  const phoneCtas = active.filter(c => c.cta_type === 'phone').map(c => digits10(c.value));
  for (const p of phones) {
    if (!phoneCtas.includes(digits10(p))) {
      out.push(`Number “${p}” is not a whitelisted call-back CTA — the operator will block this SMS.`);
    }
  }
  return out;
}

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
