/**
 * Server-side better-auth instance.
 *
 * Talks to Supabase Postgres directly via a `pg` Pool (better-auth's
 * native Postgres adapter — no ORM in the middle). The `search_path`
 * option on the Pool means better-auth's auto-discovered table names
 * (`user`, `session`, `account`, `verification`) resolve inside the
 * `betterauth` schema we created in migration `002_betterauth_schema.sql`.
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
 *
 * See docs/AUTH_SETUP.md for the full setup checklist (incl. the exact Google
 * Cloud redirect URIs that must be registered).
 */
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { Pool } from 'pg';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── Env diagnostics ──────────────────────────────────────────────────────────
// better-auth silently falls back to empty strings when these are missing,
// which surfaces later as cryptic "invalid_client" / connection errors deep in
// the OAuth round-trip. Fail loud at module init instead — once, with the exact
// list of what's missing — so the cause is obvious in the server log.
const BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_CONFIGURED = Boolean(GOOGLE_ID && GOOGLE_SECRET);

(function assertAuthEnv() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL)       missing.push('DATABASE_URL');
  if (!process.env.BETTER_AUTH_SECRET) missing.push('BETTER_AUTH_SECRET');
  if (!process.env.BETTER_AUTH_URL)    missing.push('BETTER_AUTH_URL (defaulting to http://localhost:3000)');
  if (!GOOGLE_ID)                      missing.push('GOOGLE_CLIENT_ID');
  if (!GOOGLE_SECRET)                  missing.push('GOOGLE_CLIENT_SECRET');
  if (missing.length) {
    console.error(
      '[auth] Missing required env — auth will not work correctly until these are set in .env.local:\n' +
      missing.map(m => `        • ${m}`).join('\n') +
      '\n        See docs/AUTH_SETUP.md.'
    );
  }
})();

// Single pg Pool reused across requests. better-auth's docs warn against
// creating a new Pool per request — it leaks connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Set search_path so better-auth's "user", "session", etc. resolve in our
  // `betterauth` schema rather than `public`. `public` is still on the path
  // so any auth-internal queries that touch public.* (none today) still work.
  options: '-c search_path=betterauth,public',
});

// Belt-and-suspenders: also SET search_path on every new physical connection.
// The startup `options` param above is honored by a direct or Session-pooler
// connection, but some poolers strip it. The query is enqueued synchronously in
// the 'connect' handler — pg runs it before the acquiring caller's first query,
// so there's no race. NOTE: use a direct or *Session* pooler connection, not the
// Transaction pooler (6543) — a session-level SET won't persist across its
// per-transaction backends, and better-auth's tables would fail to resolve.
pool.on('connect', (client) => {
  client.query('set search_path to betterauth, public').catch((e) => {
    console.error('[auth] failed to set search_path on new connection:', (e as Error).message);
  });
});

const IS_PROD = process.env.NODE_ENV === 'production';

// Canonical host derived from BETTER_AUTH_URL (e.g. "instarishta.me"). Used to
// share the session cookie across apex + www in production.
const CANONICAL_HOST = (() => {
  try { return new URL(BASE_URL).hostname; } catch { return ''; }
})();

/**
 * Origins better-auth will accept for OAuth callbacks / CSRF origin checks.
 *
 * The dev server runs with `next dev -H 0.0.0.0`, so the same app is reachable
 * at localhost, 127.0.0.1, and the LAN IP. better-auth validates the request
 * Origin against baseURL + trustedOrigins; without these entries a Google
 * round-trip started on one host and finished on another is rejected. (This is
 * the churn behind the "0.0.0.0 → localhost" commits in git history.)
 */
const trustedOrigins = Array.from(new Set([
  BASE_URL,
  process.env.NEXT_PUBLIC_SITE_URL,
  ...(IS_PROD
    ? []
    : ['http://localhost:3000', 'http://127.0.0.1:3000']),
].filter((v): v is string => Boolean(v))));

// Best-effort audit write. Uses the same pool (so it shares the betterauth
// search_path) and NEVER throws into the auth flow.
async function audit(row: {
  event: string;
  userId?: string | null;
  email?: string | null;
  provider?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `insert into "auth_audit" (event, user_id, email, provider, ip_address, user_agent)
       values ($1, $2, $3, $4, $5, $6)`,
      [row.event, row.userId ?? null, row.email ?? null, row.provider ?? null,
       row.ipAddress ?? null, row.userAgent ?? null],
    );
  } catch (e) {
    console.warn('[auth] audit write failed (non-fatal):', (e as Error).message);
  }
}

export const auth = betterAuth({
  database: pool,
  secret:   process.env.BETTER_AUTH_SECRET,
  baseURL:  BASE_URL,
  trustedOrigins,

  // ── Email + Password ───────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    // Set true if you want users to verify email before they can sign in.
    // For now keep false — friction-free signup, magic-link is the verified path.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  // ── Account linking ──────────────────────────────────────────────────────────
  // Without this, a user who first signed up with a magic-link / password and
  // later clicks "Continue with Google" (same email) hits
  // "account already exists" instead of having the Google credential linked.
  // Google verifies the email, so linking is safe; mark it a trusted provider.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
  },

  // ── Social: Google ─────────────────────────────────────────────────────────
  socialProviders: GOOGLE_CONFIGURED ? {
    google: {
      clientId:     GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      // Minimum non-sensitive scopes — no Google verification required.
      scope: ['openid', 'email', 'profile'],
      // Always show the Google account chooser. Avoids the silent re-login to a
      // stale/wrong account that looks like "Google login does nothing".
      prompt: 'select_account',
      // Explicit redirect URI so it never drifts from what's registered in the
      // Cloud Console. MUST be added there verbatim (see docs/AUTH_SETUP.md).
      redirectURI: `${BASE_URL}/api/auth/callback/google`,
      // Map the Google profile onto our user row so name + avatar are populated
      // on first sign-in (the "OAuth profile overlay" from xavio).
      mapProfileToUser: (profile) => ({
        name:          profile.name,
        image:         profile.picture,
        emailVerified: profile.email_verified,
      }),
    },
  } : {},

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
    // A session is "fresh" for 15 min after creation. Sensitive admin mutations
    // require a fresh session (step-up) — see src/lib/admin-route.ts.
    freshAge:     60 * 15,
    cookieCache:  { enabled: true, maxAge: 60 * 5 },
  },

  // ── Rate limiting (brute-force / abuse protection) ───────────────────────────
  // DB-backed so limits hold across Vercel's isolated serverless instances
  // (migration 004 created betterauth."rateLimit"). Tighter rules on the
  // credential + magic-link paths where abuse is costly.
  rateLimit: {
    enabled: true,           // better-auth only enables this in prod by default; force it on
    window:  60,
    max:     60,             // generic default per IP
    storage: 'database',
    customRules: {
      '/sign-in/email':     { window: 60,  max: 5  },
      '/sign-up/email':     { window: 300, max: 5  },
      '/sign-in/magic-link':{ window: 300, max: 4  },
      '/sign-in/social':    { window: 60,  max: 10 },
    },
  },

  // ── Cookies ──────────────────────────────────────────────────────────────────
  advanced: {
    // Trust proxy headers (Vercel + Cloudflare) for the client IP used in rate
    // limiting + session.ipAddress / audit — otherwise every request looks like
    // the proxy's IP.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
    },
    // HTTPS-only cookies in production; allow plain http on localhost in dev.
    useSecureCookies: IS_PROD,
    defaultCookieAttributes: {
      sameSite: 'lax',          // 'lax' survives the top-level OAuth redirect
      secure:   IS_PROD,
      httpOnly: true,
    },
    // Share the auth cookie across apex + www in production (parallels xavio's
    // NEXT_PUBLIC_COOKIE_DOMAIN=.xavio.in). Disabled in dev / when host unknown.
    ...(IS_PROD && CANONICAL_HOST && !CANONICAL_HOST.includes('localhost')
      ? { crossSubDomainCookies: { enabled: true, domain: `.${CANONICAL_HOST}` } }
      : {}),
  },

  // ── Audit hooks (best-effort; never block auth) ──────────────────────────────
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await audit({ event: 'user.created', userId: user.id, email: user.email });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await audit({
            event: 'session.created',
            userId: session.userId,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          });
        },
      },
    },
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
