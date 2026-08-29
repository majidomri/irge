/**
 * Server-side verification of Firebase Phone Auth ID tokens.
 *
 * ── Why Firebase at all ──────────────────────────────────────────────────────
 * Sending A2P SMS to Indian numbers requires DLT registration (TRAI) under a
 * registered entity — header + template registered on every operator portal.
 * With Firebase Phone Auth, *Google* is the sender of record: it owns the DLT
 * registration, and we never touch an SMS gateway. That is the only phone-OTP
 * path that works without a registered firm.
 *
 * ── Why not firebase-admin ───────────────────────────────────────────────────
 * A Firebase ID token is a plain RS256 JWT signed by Google. Verifying it needs
 * only the public JWKS — no service-account key, no Admin SDK, no extra secret
 * in the environment, and it runs anywhere (Node, edge, serverless cold start).
 * `firebase-admin` would add ~10 MB and a private key for zero extra assurance.
 *
 * ── What a valid token proves ────────────────────────────────────────────────
 * That, within the last few minutes, someone completed a Firebase SMS challenge
 * on `phone_number`. That is exactly the claim better-auth's phoneNumber plugin
 * wants from `verifyOTP` — see src/lib/auth.ts.
 *
 * Required env:
 *   FIREBASE_PROJECT_ID  — Firebase console → Project settings → Project ID.
 *                          Falls back to NEXT_PUBLIC_FIREBASE_PROJECT_ID, which
 *                          is necessarily the same value.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/**
 * Google's public keys for Secure Token Service, in JWK form. (The x509 endpoint
 * Google's own docs cite is the same keys in PEM; `jose` wants JWK.) Keys rotate
 * roughly daily; `createRemoteJWKSet` caches them and refetches on an unknown
 * `kid`, so this must be module-level — a per-request set would fetch every time.
 */
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Reject tokens older than this even though Firebase mints them with a 1-hour
 * life. The exchange happens milliseconds after the SMS challenge, so anything
 * older is a replay or a token lifted from somewhere. Ten minutes leaves room
 * for a slow network and a badly-skewed client clock.
 */
const MAX_TOKEN_AGE = '10 minutes';

/** Tolerance for client/server clock skew on exp/iat/nbf. */
const CLOCK_TOLERANCE = '60 seconds';

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  '';

/** True when the server is configured to accept Firebase phone tokens. */
export const firebasePhoneVerifyConfigured = Boolean(PROJECT_ID);

// Built lazily so an unconfigured deployment never opens the network handle,
// then reused for the lifetime of the process.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

/** The subset of Firebase's ID-token claims we care about. */
interface FirebaseIdTokenClaims extends JWTPayload {
  phone_number?: string;
  auth_time?: number;
  firebase?: {
    sign_in_provider?: string;
    identities?: Record<string, unknown>;
  };
}

export interface VerifiedFirebasePhone {
  /** Firebase UID (`sub`). Stable per phone number within the project. */
  uid: string;
  /** E.164, e.g. `+919876543210`. */
  phoneNumber: string;
}

/** E.164: leading +, 8–15 digits, no leading zero on the country code. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Verify a Firebase ID token and return its phone identity.
 *
 * Returns `null` — never throws — for every failure mode, so callers can treat
 * it as a plain boolean gate. The reason is logged server-side; it is
 * deliberately not returned, so nothing leaks to the client beyond "invalid".
 */
export async function verifyFirebasePhoneToken(
  idToken: string,
): Promise<VerifiedFirebasePhone | null> {
  if (!PROJECT_ID) {
    console.error('[firebase-verify] FIREBASE_PROJECT_ID not set — refusing all phone tokens');
    return null;
  }
  if (!idToken || typeof idToken !== 'string') return null;

  let claims: FirebaseIdTokenClaims;
  try {
    // jwtVerify enforces signature, alg, iss, aud, exp/nbf and (via maxTokenAge)
    // iat. Firebase ID tokens are always RS256; pinning it blocks alg confusion.
    const { payload } = await jwtVerify<FirebaseIdTokenClaims>(idToken, getJwks(), {
      algorithms:     ['RS256'],
      issuer:         `https://securetoken.google.com/${PROJECT_ID}`,
      audience:       PROJECT_ID,
      maxTokenAge:    MAX_TOKEN_AGE,
      clockTolerance: CLOCK_TOLERANCE,
    });
    claims = payload;
  } catch (e) {
    console.warn('[firebase-verify] token rejected:', (e as Error).message);
    return null;
  }

  // `sub` is the Firebase UID. jose guarantees the claim shape, not that it is
  // non-empty; Firebase's own docs call for this check explicitly.
  const uid = typeof claims.sub === 'string' ? claims.sub : '';
  if (!uid) {
    console.warn('[firebase-verify] token rejected: empty sub');
    return null;
  }

  // A token minted by email/password, Google, or anonymous sign-in in the same
  // Firebase project would otherwise pass every check above and let its holder
  // claim an arbitrary phone number. Only the SMS challenge counts here.
  if (claims.firebase?.sign_in_provider !== 'phone') {
    console.warn(
      '[firebase-verify] token rejected: sign_in_provider is',
      claims.firebase?.sign_in_provider,
    );
    return null;
  }

  const phoneNumber = typeof claims.phone_number === 'string' ? claims.phone_number : '';
  if (!E164.test(phoneNumber)) {
    console.warn('[firebase-verify] token rejected: phone_number not E.164');
    return null;
  }

  // auth_time is when the user actually completed the challenge (iat can be
  // later, on a silent refresh). A future auth_time means a tampered clock.
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.auth_time === 'number' && claims.auth_time > nowSec + 60) {
    console.warn('[firebase-verify] token rejected: auth_time in the future');
    return null;
  }

  return { uid, phoneNumber };
}
