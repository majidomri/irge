/**
 * RCS for Business — configuration and readiness.
 *
 * ── Read this before wiring credentials ──────────────────────────────────────
 * RCS is not a self-serve API. Nothing in this folder can send a message until
 * FOUR separate approvals exist, and three of them are other people's decisions:
 *
 *   1. An RCS for Business PARTNER account. You submit the partner interest
 *      form and Google decides. There is no signup button.
 *      https://developers.google.com/business-communications/rcs-business-messaging/guides/get-started/register-partner
 *   2. A verified BRAND and an agent under it. Brand verification wants a legal
 *      entity, its registered name, website and logo.
 *   3. CARRIER LAUNCH APPROVAL, per network. Google-managed carriers take 1–3
 *      business days; carrier-managed ones need a direct agreement with that
 *      carrier first. In India that means Jio, Airtel and Vi individually.
 *   4. In India specifically, TRAI DLT registration, exactly as A2P SMS needs —
 *      which is the same wall that sent this project to Firebase Phone Auth for
 *      OTP instead of DLT SMS (see lib/firebase-verify.ts).
 *
 * Google's own India page puts it plainly: "The first step is choosing the
 * right partner." Most Indian brands never hold their own partner account; they
 * send through an aggregator that holds one.
 *
 * So the credentials below cannot exist until InstaRishta is a registered
 * business with a verified brand. That is a paperwork problem, not a code
 * problem, and this module is written so the code is finished and waiting: with
 * nothing configured everything runs in DRY RUN, renders the real payload, and
 * says exactly which of the four things is missing.
 *
 * ── Why the REST API directly, and not a vendor SDK ──────────────────────────
 * @google/rcsbusinessmessaging exists, but it is a thin wrapper over four HTTP
 * calls and it drags in the full google-auth-library. `jose` is already a
 * dependency here (lib/firebase-verify.ts), and it can sign the service-account
 * assertion, so the whole integration is three fetches and no new packages.
 *
 * Going through an aggregator later does not invalidate this: swap the base URL
 * and the auth header in lib/rcs/client.ts. The message payloads — which is the
 * part with all the detail — are Google's schema either way, because that is
 * what every aggregator forwards.
 */

/**
 * Regional endpoint. RCS routes by the REGION OF THE RECIPIENT'S NUMBER, not by
 * where this server runs, and a mismatch is rejected rather than redirected.
 * India is served by the `asia` endpoint.
 *
 * `users:batchGet` is stricter still — it 400s if one request mixes numbers
 * from different regions, and from 4 May 2026 it requires the regional host.
 */
export const RCS_REGION = process.env.RCS_REGION?.trim() || 'asia';

export const rcsBaseUrl = () => `https://${RCS_REGION}-rcsbusinessmessaging.googleapis.com/v1`;

/** The agent that sends. Created under a verified brand in the RBM console. */
export const RCS_AGENT_ID = process.env.RCS_AGENT_ID?.trim() || '';

/**
 * Service account credentials, as three separate vars rather than a pasted JSON
 * blob: the private key contains newlines, and a JSON blob in an env var is one
 * bad escape away from a parse error that only shows up at send time.
 *
 * The key is stored with literal `\n` (that is how Vercel's UI keeps it) and
 * unescaped here.
 */
export const RCS_CLIENT_EMAIL = process.env.RCS_CLIENT_EMAIL?.trim() || '';
export const RCS_PRIVATE_KEY  = (process.env.RCS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

/**
 * Shared secret for the webhook handshake, and the HMAC key Google signs event
 * payloads with. Set this to the client token you enter in the RBM console.
 */
export const RCS_CLIENT_TOKEN = process.env.RCS_CLIENT_TOKEN?.trim() || '';

/** The OAuth scope for the messaging API. */
export const RCS_SCOPE = 'https://www.googleapis.com/auth/rcsbusinessmessaging';

export interface RcsReadiness {
  ready:   boolean;
  missing: string[];
  agentId: string;
  region:  string;
}

/**
 * What is configured, and what is not.
 *
 * Reported rather than thrown, and surfaced in /nizam, because "RCS does not
 * work" has four very different causes and an admin should not have to read
 * server logs to tell which one they are looking at.
 */
export function rcsReadiness(): RcsReadiness {
  const missing: string[] = [];
  if (!RCS_AGENT_ID)     missing.push('RCS_AGENT_ID');
  if (!RCS_CLIENT_EMAIL) missing.push('RCS_CLIENT_EMAIL');
  if (!RCS_PRIVATE_KEY)  missing.push('RCS_PRIVATE_KEY');

  return { ready: missing.length === 0, missing, agentId: RCS_AGENT_ID, region: RCS_REGION };
}

/** E.164, which is the only format the RBM API accepts for a phone number. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * India's country code, used to default a bare 10-digit number.
 *
 * The listings carry numbers in mixed shapes — `+918886667121` in jsdata, plain
 * 10-digit elsewhere — and sending to a non-E.164 string is a 400 per number
 * rather than a useful error, so normalising is worth doing once, here.
 */
export function toE164(raw: string, defaultCc = '+91'): string | null {
  const trimmed = (raw ?? '').replace(/[\s()\-.]/g, '');
  if (!trimmed) return null;
  if (trimmed.startsWith('+'))  return E164.test(trimmed) ? trimmed : null;
  if (trimmed.startsWith('00')) { const p = '+' + trimmed.slice(2); return E164.test(p) ? p : null; }
  // A bare 10-digit Indian mobile. Anything else is too ambiguous to guess at.
  if (/^[6-9]\d{9}$/.test(trimmed)) return defaultCc + trimmed;
  return null;
}
