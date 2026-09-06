/**
 * Contact redaction for listing text, in one place.
 *
 * The rule this site runs on is that a family controls when its contact
 * details are released. Listing bodies are free text written by those
 * families, and they routinely put a number, an email or an Instagram handle
 * straight into the prose — so every surface that serves listing text has to
 * strip them, not just the ones we remembered.
 *
 * This exists because there were two copies of that logic and they had already
 * drifted. lib/markdown-view caught keyword-adjacent digits ("whatsapp: 9876")
 * and components/WebMcpTools did not, so the same listing was redacted for a
 * crawler reading markdown and served intact to an AI agent calling the page's
 * own tool. Neither caught an email address at all.
 *
 * The shape is borrowed from Google's Sensitive Data Protection: name the
 * categories you are looking for, detect them in one pass, and apply the same
 * transformation everywhere — rather than hand-rolling a regex per caller and
 * hoping they stay in step. The detectors are local regexes rather than a
 * cloud API because this runs inline on every render of a 500-item listing;
 * a network call per string is not available to us.
 */

export const REDACTED = '[contact removed]';

/**
 * What counts as a contact detail here. Order matters: emails are consumed
 * before handles, or the local part of an address is mistaken for one.
 */
const DETECTORS: { name: string; pattern: RegExp; test?: (m: string) => boolean }[] = [
  {
    name: 'EMAIL_ADDRESS',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // A run of digits long enough to dial, however it is spaced or punctuated.
    name: 'PHONE_NUMBER',
    pattern: /(?:\+?\d[\d\s().-]{5,}\d)/g,
    test: (m) => m.replace(/\D/g, '').length >= 7,
  },
  {
    /**
     * Digits next to a word that announces a contact channel. Catches the
     * short forms a plain digit-count rule misses — "call 98765" is five
     * digits and would otherwise pass.
     */
    name: 'CONTACT_KEYWORD',
    pattern:
      /\b(?:whatsapp|whats app|wa|call|contact|phone|mobile|cell|num(?:ber)?|رابطہ|فون)\b\s*[:\-–]?\s*\S{0,4}\d[\d\s().-]*/gi,
  },
  {
    /**
     * A social handle. Instagram is where these listings come from, so it is
     * a real contact route rather than a hypothetical one. Three characters
     * minimum to avoid swallowing a stray "@".
     */
    name: 'SOCIAL_HANDLE',
    pattern: /(?:^|[\s(])@[A-Za-z0-9._]{3,30}\b/g,
  },
];

/**
 * Replace every detected contact detail with a marker.
 *
 * Deliberately blunt. A false positive costs a redacted digit in a sentence
 * about someone's height; a false negative publishes a phone number.
 */
export function redactContacts(text: string): string {
  if (!text) return '';

  let out = text;

  for (const { pattern, test } of DETECTORS) {
    out = out.replace(pattern, (match) => {
      if (test && !test(match)) return match;

      // The handle detector captures a leading separator; keep it so words do
      // not run together.
      const lead = /^[\s(]/.test(match) ? match[0] : '';
      return lead + REDACTED;
    });
  }

  // Several detectors firing on one span reads as noise; collapse the runs.
  return out
    .replace(/\[contact removed\](?:[\s,;:–-]*\[contact removed\])+/g, REDACTED)
    .trim();
}

/**
 * True when the text still looks like it carries a contact detail after
 * redaction — a cheap assertion for tests and for anywhere that wants to fail
 * loudly rather than serve something questionable.
 */
export function looksRedacted(text: string): boolean {
  return !DETECTORS.some(({ pattern, test }) => {
    pattern.lastIndex = 0;
    const matches = text.match(pattern) ?? [];
    return matches.some((m) => (test ? test(m) : true));
  });
}
