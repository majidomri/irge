/**
 * Server-side better-auth instance.
 *
 * Talks to Supabase Postgres directly via a `pg` Pool (better-auth's
 * native Postgres adapter — no ORM in the middle). The `search_path`
 * option on the Pool means better-auth's auto-discovered table names
 * (`user`, `session`, `account`, `verification`) resolve inside the
 * `betterauth` schema we created in migration `betterauth_schema_init`.
 *
 * Required env vars:
 *   DATABASE_URL          — Supabase "Connection string" → Pooled/Transaction
 *                           mode, e.g. postgresql://postgres:...@aws-0-...
 *                           (Supabase Dashboard → Settings → Database)
 *   BETTER_AUTH_SECRET    — 32+ char random string for signing session cookies
 *   BETTER_AUTH_URL       — canonical app URL, e.g. https://instarishta.me
 *                           or http://localhost:3000 in dev
 *   GOOGLE_CLIENT_ID      — OAuth web client (Cloud Console → Credentials)
 *   GOOGLE_CLIENT_SECRET  — paired secret
 *   RESEND_API_KEY        — for magic-link delivery (already in env from before)
 *   RESEND_FROM           — verified sender, e.g. "InstaRishta <auth@instarishta.me>"
 */
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { Pool } from 'pg';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Single pg Pool reused across requests. better-auth's docs warn against
// creating a new Pool per request — it leaks connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Set search_path so better-auth's "user", "session", etc. resolve in our
  // `betterauth` schema rather than `public`. `public` is still on the path
  // so any auth-internal queries that touch public.* (none today) still work.
  options: '-c search_path=betterauth,public',
});

export const auth = betterAuth({
  database: pool,
  secret:   process.env.BETTER_AUTH_SECRET,
  baseURL:  process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',

  // ── Email + Password ───────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    // Set true if you want users to verify email before they can sign in.
    // For now keep false — friction-free signup, magic-link is the verified path.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  // ── Social: Google ─────────────────────────────────────────────────────────
  socialProviders: {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      // Minimum non-sensitive scopes — no Google verification required.
      scope: ['openid', 'email', 'profile'],
    },
  },

  // ── Magic Link (email) ─────────────────────────────────────────────────────
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (!resend) {
          console.warn('[auth] RESEND_API_KEY not set — magic-link not sent for', email);
          console.warn('[auth] magic-link URL (would have been emailed):', url);
          return;
        }
        const from = process.env.RESEND_FROM ?? 'InstaRishta <auth@instarishta.me>';
        await resend.emails.send({
          from,
          to: email,
          subject: 'Your InstaRishta sign-in link',
          html: `
            <p>السلام علیکم،</p>
            <p>Click below to sign in to InstaRishta:</p>
            <p>
              <a href="${url}"
                 style="display:inline-block;padding:12px 22px;border-radius:999px;background:#00A86B;color:#fff;text-decoration:none;font-weight:600;">
                Sign in to InstaRishta
              </a>
            </p>
            <p style="color:#666;font-size:12px;">
              Or paste this link: <br><span style="word-break:break-all;">${url}</span><br><br>
              This link expires in 5 minutes. If you didn't request it, you can ignore this email.
            </p>
          `,
        });
      },
    }),
  ],

  // ── Session ────────────────────────────────────────────────────────────────
  session: {
    // 30-day rolling session, refresh on every active day.
    expiresIn:    60 * 60 * 24 * 30,
    updateAge:    60 * 60 * 24,
    cookieCache:  { enabled: true, maxAge: 60 * 5 },
  },
});

/**
 * True if the user signed in with one of the emails in ADMIN_EMAILS env var.
 * Used by middleware to gate /nizam and by /api/admin/* routes.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
