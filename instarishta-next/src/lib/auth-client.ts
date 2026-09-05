/**
 * Client-side better-auth React wrapper.
 *
 * Imported by client components for sign-in/up, session reads, sign-out.
 * Talks to the catch-all handler at /api/auth/[...all] which is mounted in
 * src/app/api/auth/[...all]/route.ts.
 */
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, oneTapClient, phoneNumberClient } from 'better-auth/client/plugins';

/**
 * The browser half of Google One Tap.
 *
 * Public by necessity: the client ID is in the page for Google's own script
 * to read, which is what NEXT_PUBLIC_GOOGLE_CLIENT_ID is for. It is not a
 * secret -- the secret is GOOGLE_CLIENT_SECRET, which stays server-side and
 * is never used by this flow at all.
 *
 * Absent config means no plugin rather than a broken one, so a preview
 * deployment without Google set up simply never prompts.
 */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export const authClient = createAuthClient({
  // baseURL omitted intentionally — better-auth defaults to current origin,
  // which is exactly what we want (works on localhost, preview, prod).
  plugins: [
    magicLinkClient(),
    phoneNumberClient(),
    ...(GOOGLE_CLIENT_ID
      ? [oneTapClient({
          clientId: GOOGLE_CLIENT_ID,
          /**
           * Never sign someone in without them touching anything. autoSelect
           * would do exactly that for a returning visitor with one Google
           * account, and a session appearing on its own reads as a bug even
           * when it is a feature.
           */
          autoSelect: false,
          /**
           * FedCM is the browser-mediated path Chrome is moving to as
           * third-party cookies go away, so it stays on. `cancelOnTapOutside`
           * is deliberately not set: it is documented as requiring FedCM off,
           * and losing FedCM to gain a dismissal nicety is the wrong trade.
           */
          promptOptions: { fedCM: true, maxAttempts: 2, baseDelay: 1500 },
        })]
      : []),
  ],
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
  /**
   * Phone sign-in. Only `phoneNumber.verify` is used, and its `code` is a
   * Firebase ID token rather than a six-digit OTP — Firebase runs the SMS
   * challenge in the browser (see src/lib/firebase-phone.ts) and the server
   * verifies its signature (see src/lib/firebase-verify.ts).
   */
  phoneNumber,
} = authClient;

export type Session = ReturnType<typeof useSession> extends { data: infer D } ? D : never;
