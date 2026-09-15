/**
 * The bot's reply keywords and the messages that answer them.
 *
 * These are the exact lists and wording filed in the RCS onboarding form
 * (Consent Management section) and published on /alerts. Google's reviewers
 * test the live agent against that form, so this file is the one place they
 * are defined — change the form, /alerts and this together, or not at all.
 *
 * The bot is one-way (A2P): these keywords are the ONLY replies it acts on.
 * Anything else is logged and left alone; there is no conversational flow.
 */

/** Filed: STOP, UNSUBSCRIBE, OPTOUT, OPT-OUT, OPT OUT, CANCEL, END, QUIT. */
export const OPTOUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPTOUT', 'OPT-OUT', 'OPT OUT', 'CANCEL', 'END', 'QUIT'] as const;

/** Filed: START, SUBSCRIBE. Deliberately not HI or HELLO — a greeting is not a request to be messaged again. */
export const RESUBSCRIBE_KEYWORDS = ['START', 'SUBSCRIBE'] as const;

/**
 * Sent when a member opts out. Configured on the RCS platform (which sends it),
 * kept here so the console setting can be checked against what was filed.
 */
export const OPTOUT_CONFIRMATION =
  'You have been unsubscribed from InstaRishta alerts and will not receive further messages on RCS. ' +
  'To subscribe again, reply START or turn on alerts at instarishta.me/account.';

/** Normalise a reply for matching: case, surrounding space, trailing punctuation, inner whitespace. */
function normalise(text: string): string {
  return text.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Opt-out when the reply BEGINS with a keyword ("STOP", "stop please").
 * Erring towards honouring a stop is the safe direction: a missed opt-out is
 * a TRAI complaint, an extra one costs one member a tap to undo.
 */
export function isOptOut(text: string): boolean {
  const t = normalise(text);
  // Keyword, then end or a non-alphanumeric: "STOP", "STOP please", "STOP, thanks" —
  // but not "ENDING" or "CANCELLED", which are words, not requests.
  return OPTOUT_KEYWORDS.some(k => t.startsWith(k) && (t.length === k.length || !/[A-Z0-9]/.test(t[k.length])));
}

/**
 * Re-subscribe only when the reply IS a keyword, nothing more. The opposite
 * bias to isOptOut: "start" inside an ordinary sentence must never put a
 * number back on the list.
 */
export function isResubscribe(text: string): boolean {
  const t = normalise(text);
  return (RESUBSCRIBE_KEYWORDS as readonly string[]).includes(t);
}
