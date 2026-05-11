/**
 * Client-side better-auth React wrapper.
 *
 * Imported by client components for sign-in/up, session reads, sign-out.
 * Talks to the catch-all handler at /api/auth/[...all] which is mounted in
 * src/app/api/auth/[...all]/route.ts.
 */
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // baseURL omitted intentionally — better-auth defaults to current origin,
  // which is exactly what we want (works on localhost, preview, prod).
  plugins: [magicLinkClient()],
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
} = authClient;

export type Session = ReturnType<typeof useSession> extends { data: infer D } ? D : never;
