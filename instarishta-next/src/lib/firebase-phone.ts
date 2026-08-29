'use client';
/**
 * Browser half of phone sign-in: Firebase Phone Auth.
 *
 * Firebase owns the whole OTP challenge — it sends the SMS, it holds the code,
 * it checks the code — and hands back an ID token proving the number. That token
 * is what we post to better-auth's /phone-number/verify (see src/lib/auth.ts),
 * which verifies its signature server-side and issues our own session cookie.
 * Firebase is a *verifier* here, not our auth system; the session, the user row
 * and every downstream API stay better-auth's.
 *
 * The SDK is loaded with a dynamic `import()` on first use. It is ~200 kB and
 * only a minority of visitors will ever pick the phone option, so it must not
 * ride along in the main bundle.
 *
 * Required env (all public — Firebase web config is not secret; access is
 * controlled by the authorized-domains list and reCAPTCHA, not by the key):
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 */
import type { Auth, ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

const firebaseConfig = {
  apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY     ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID  ?? '',
};

/**
 * Whether to offer the phone option at all. Mirrors the server's own gate
 * (`FIREBASE_PROJECT_ID` in firebase-verify.ts) — with these unset the UI hides
 * the button rather than letting a user walk into a dead end.
 */
export const phoneSignInEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

let authPromise: Promise<Auth> | null = null;

/** Initialise (once) and return the Firebase Auth instance. */
function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const [{ getApps, initializeApp }, { getAuth }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    // Next's dev server re-executes modules on HMR; reuse any existing app so a
    // second init doesn't throw "Firebase App named '[DEFAULT]' already exists".
    const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    // Send the SMS in the user's own language when Firebase can infer one.
    auth.useDeviceLanguage();
    return auth;
  })();
  return authPromise;
}

// One verifier per page-load. Firebase burns a reCAPTCHA token per send, so the
// verifier has to be torn down and rebuilt between attempts — see clearRecaptcha.
let verifier: RecaptchaVerifier | null = null;

/**
 * Destroy the current reCAPTCHA verifier.
 *
 * MUST be called after a failed send. A verifier holds a single-use token; if it
 * is reused, the next `signInWithPhoneNumber` fails with
 * `auth/invalid-app-credential` or hangs on an invisible widget that never
 * re-solves. The UI calls this on every error path and on unmount.
 */
export function clearRecaptcha(): void {
  try { verifier?.clear(); } catch { /* already torn down */ }
  verifier = null;
}

/**
 * Send an SMS OTP to `phoneNumber` (E.164, e.g. `+919876543210`).
 *
 * `containerId` is the id of an empty div the invisible reCAPTCHA mounts into.
 * Returns Firebase's ConfirmationResult — hand the user's code to
 * {@link confirmPhoneCode} next.
 */
export async function sendPhoneOtp(
  phoneNumber: string,
  containerId: string,
): Promise<ConfirmationResult> {
  const auth = await getFirebaseAuth();
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth');

  clearRecaptcha();
  // 'invisible' means no checkbox: reCAPTCHA scores the session silently and
  // only challenges when it is suspicious. It is not optional — Firebase
  // refuses to send an SMS from the web without an App Verifier, and it is the
  // front line against SMS-pumping fraud (which bills to us, per message).
  verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });

  try {
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  } catch (e) {
    clearRecaptcha();
    throw e;
  }
}

/**
 * Confirm the six-digit code and return the Firebase **ID token**.
 *
 * That token — not the six digits — is what goes to better-auth: it is signed by
 * Google, carries the verified `phone_number` claim, and can be checked on the
 * server without trusting the client at all.
 */
export async function confirmPhoneCode(
  confirmation: ConfirmationResult,
  code: string,
): Promise<string> {
  const credential = await confirmation.confirm(code);
  return credential.user.getIdToken();
}

/**
 * Sign the user out of Firebase.
 *
 * Firebase's own session is a side effect we have no use for once the ID token
 * is spent — our session is the better-auth cookie. Dropping it keeps a stale
 * Firebase login from lingering in IndexedDB after the user signs out of ours.
 */
export async function forgetFirebaseSession(): Promise<void> {
  if (!authPromise) return;
  try {
    const auth = await authPromise;
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  } catch { /* best-effort */ }
}

/** Map Firebase's error codes onto something a user can act on. */
export function humanizePhoneError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-phone-number':    'That does not look like a valid phone number.',
    'auth/missing-phone-number':    'Enter your phone number.',
    'auth/quota-exceeded':          'Too many codes requested right now. Please try again later.',
    'auth/too-many-requests':       'Too many attempts from this device. Please wait a few minutes.',
    'auth/invalid-verification-code': 'That code is not right. Check the SMS and try again.',
    'auth/code-expired':            'That code expired. Request a new one.',
    'auth/captcha-check-failed':    'Verification failed. Please reload the page and try again.',
    'auth/invalid-app-credential':  'Verification failed. Please reload the page and try again.',
    'auth/unauthorized-domain':     'Phone sign-in is not enabled for this domain yet.',
    'auth/network-request-failed':  'Network problem. Check your connection and try again.',
  };
  return map[code] ?? 'Could not verify your number. Please try again.';
}
