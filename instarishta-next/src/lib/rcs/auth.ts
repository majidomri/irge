/**
 * Service-account access tokens for the RCS Business Messaging API.
 *
 * Google's server-to-server flow, done directly: sign a JWT asserting who we
 * are and what scope we want, POST it to the token endpoint, get a bearer token
 * back. That is the whole of what google-auth-library would do here, and `jose`
 * — already a dependency for verifying Firebase ID tokens — signs the assertion,
 * so this costs no new package.
 *
 * The token is cached in module scope. On a serverless runtime that cache lives
 * as long as the instance does, which is exactly the right lifetime: a warm
 * instance sending a batch reuses one token, a cold one mints a fresh token it
 * would have needed anyway. There is no correctness risk in losing it.
 */
import { SignJWT, importPKCS8 } from 'jose';
import { RCS_CLIENT_EMAIL, RCS_PRIVATE_KEY, RCS_SCOPE } from './config';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Refresh this long before the token actually dies.
 *
 * Google issues one-hour tokens. Cutting it fine means a request that passes
 * the check and then arrives at Google expired — a 401 on a send that already
 * consumed a message id, which is the worst moment to discover clock skew.
 */
const EXPIRY_MARGIN_MS = 5 * 60_000;

let cached: { token: string; expiresAt: number } | null = null;

/** Requested lifetime of the assertion. Google caps this at one hour. */
const ASSERTION_TTL_SECONDS = 3600;

/**
 * A bearer token for the messaging scope.
 *
 * Throws rather than returning null: every caller needs the token to do
 * anything at all, and an auth failure is a configuration fault worth seeing in
 * full rather than a condition to branch on.
 */
export async function rcsAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return cached.token;

  if (!RCS_CLIENT_EMAIL || !RCS_PRIVATE_KEY) {
    throw new Error('RCS service account is not configured (RCS_CLIENT_EMAIL / RCS_PRIVATE_KEY)');
  }

  let key;
  try {
    key = await importPKCS8(RCS_PRIVATE_KEY, 'RS256');
  } catch (e) {
    // Overwhelmingly the cause: the private key was pasted with literal "\n"
    // that never got unescaped, or the BEGIN/END lines were dropped. Say so,
    // because the raw jose error ("Invalid PEM") does not point anywhere.
    throw new Error(
      `RCS_PRIVATE_KEY is not a valid PKCS#8 PEM — it must start with "-----BEGIN PRIVATE KEY-----" ` +
      `and its newlines must survive the env var. Underlying error: ${(e as Error).message}`,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: RCS_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(RCS_CLIENT_EMAIL)
    .setSubject(RCS_CLIENT_EMAIL)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + ASSERTION_TTL_SECONDS)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache:  'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  const body = await res.json().catch(() => ({})) as {
    access_token?: string; expires_in?: number; error?: string; error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    // `invalid_grant` here almost always means server clock skew or a key that
    // has been rotated out from under the deployment — both worth naming.
    const detail = body.error_description || body.error || `HTTP ${res.status}`;
    throw new Error(`RCS token exchange failed: ${detail}`);
  }

  cached = {
    token:     body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? ASSERTION_TTL_SECONDS) * 1000,
  };
  return cached.token;
}

/** Drop the cached token. For tests, and for a credential rotation mid-process. */
export function clearRcsTokenCache(): void {
  cached = null;
}
