# Auth setup & Google login checklist

InstaRishta authenticates with **better-auth** (not Supabase Auth). It stores its
own `user / session / account / verification` tables in a private `betterauth`
Postgres schema, reached over a direct `pg` connection — separate from the
anon/Supabase-JS data path in `src/lib/db.ts`.

If "Continue with Google" does nothing, errors, or bounces back signed-out, walk
this list top to bottom. Steps 1–3 are the usual culprits.

---

## 1. Environment variables (`.env.local`)

better-auth falls back to **empty strings** when these are unset, which fails
deep inside the OAuth round-trip with cryptic errors. All of these are required:

| Var | Where to get it |
| --- | --- |
| `DATABASE_URL` | Supabase Dashboard → Settings → Database → Connection string → **Session pooler** (IPv4-safe; port `5432`). `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres`. **Not** the Transaction pooler (6543) — see note below. The direct `db.<ref>.supabase.co` host also works but is IPv6-only. |
| `BETTER_AUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` in dev, `https://instarishta.me` in prod |
| `GOOGLE_CLIENT_ID` | Cloud Console → Credentials → your **Web** OAuth client → Client ID |
| `GOOGLE_CLIENT_SECRET` | …same client → Client secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same Client ID (already present; used by the client) |
| `ADMIN_EMAILS` | Comma-separated emails allowed into `/nizam` |
| `SUPABASE_JWT_SECRET` | *Optional.* Dashboard → Settings → API → JWT Settings → "JWT Secret". Enables the session-fabric bridge (true real-time credits + per-user RLS). Blank = falls back to focus+poll. |
| `ADMIN_FRESH_SESSION` | *Optional.* `1` to require a fresh (<15 min) session for admin mutations. |

On boot, `src/lib/auth.ts` logs `[auth] Missing required env …` listing anything
absent — check the server console first.

> **Pooling mode matters.** `auth.ts` sets `search_path=betterauth` on the
> connection (so better-auth's unqualified `"user"`/`"session"` resolve into the
> `betterauth` schema) and re-applies it on every new connection. That
> session-level setting persists on a **direct** or **Session pooler**
> connection, but **not** on the **Transaction pooler (6543)** — there a
> `SET search_path` doesn't follow the per-transaction backend, and every auth
> query fails with "relation \"user\" does not exist". Use the Session pooler.

> The Google button only registers as a provider when **both**
> `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. With them blank, the
> provider is omitted entirely (so it fails clean rather than with `invalid_client`).

---

## 2. Google Cloud Console — Authorized redirect URIs

On the **Web** OAuth client, under **Authorized redirect URIs**, add the callback
for every origin you run on. The path is always `/api/auth/callback/google`:

```
http://localhost:3000/api/auth/callback/google
https://instarishta.me/api/auth/callback/google
https://www.instarishta.me/api/auth/callback/google   # if you serve www
```

And under **Authorized JavaScript origins**:

```
http://localhost:3000
https://instarishta.me
https://www.instarishta.me
```

The redirect URI must match `${BETTER_AUTH_URL}/api/auth/callback/google`
**exactly** (scheme + host + port + path). A mismatch is Google error
`redirect_uri_mismatch`. `src/lib/auth.ts` now pins `redirectURI` from
`BETTER_AUTH_URL`, so keep that env var correct.

> The dev server runs `next dev -H 0.0.0.0`, so it answers on `localhost`,
> `127.0.0.1`, and your LAN IP. Always start sign-in from `http://localhost:3000`
> (the value in `BETTER_AUTH_URL`). `trustedOrigins` in `auth.ts` whitelists
> `localhost` + `127.0.0.1` in dev; add a LAN IP there if you test from a phone.

---

## 3. Database schema

The `betterauth` schema + tables must exist. They are committed in
`supabase/migrations/002_betterauth_schema.sql` (previously applied out-of-band
and never checked in). Apply it once per database:

```bash
# via Supabase SQL editor: paste the file contents, or
psql "$DATABASE_URL" -f supabase/migrations/002_betterauth_schema.sql
```

Sanity check the tables exist and are case-correct (camelCase, quoted):

```sql
select table_name from information_schema.tables where table_schema = 'betterauth';
-- expect: user, session, account, verification, auth_audit
```

> Do **not** add `betterauth` to Supabase's API "Exposed schemas" — it is
> intentionally private and reached only via the direct `pg` connection.

---

## 4. What changed (and why) — `src/lib/auth.ts`

- **`trustedOrigins`** — accepts `localhost`/`127.0.0.1` in dev so an OAuth
  round-trip started on one host isn't rejected on return.
- **`account.accountLinking`** (google trusted) — a magic-link/password user who
  later clicks Google with the same (Google-verified) email gets the credential
  linked instead of `account already exists`.
- **Google `prompt: 'select_account'`** — always show the account chooser; fixes
  the "nothing happens / wrong account" silent re-login.
- **Google `redirectURI`** pinned from `BETTER_AUTH_URL` (no drift).
- **`mapProfileToUser`** — populate name + avatar + verified flag on first sign-in.
- **Cookie hardening** (`advanced`) — secure cookies + `SameSite=Lax` in prod;
  shared across apex+www via `crossSubDomainCookies` (parallels xavio's
  `.xavio.in` cookie domain). Dev stays on plain http.
- **`session.freshAge = 15m`** + best-effort **audit log** (`betterauth.auth_audit`)
  on `user.created` / `session.created`.

## 5. Admin step-up (optional)

`withAdmin` can require a *fresh* (< 15 min) session for mutating `/api/admin/*`
methods — set `ADMIN_FRESH_SESSION=1`. Off by default because there is no
re-auth challenge screen yet; when on, stale-session mutations return
`401 { code: 'fresh_session_required' }` and the user must sign in again.

---

## 6. Credits, real-time, and the session fabric

The contact-credits system runs on better-auth (the original Supabase-Auth
version was removed in commit 775b179 and rebuilt):

- **Storage** — `ir_user_profiles.contact_credits` (matched to the better-auth
  user by email) + the rolling-window `ir_user_usage` table (migration `003`).
- **API** — `/api/account/profile` (read), `/api/account/consume` (spend),
  `/api/account/sessions` (device list / revoke others). All better-auth gated.
- **UI** — `/account` (credits, plan, sessions), `/account/devices`, and the
  contact gate in `ProfilesClient` (anon → sign in; signed-in → spend; 0 → upgrade).
- **Admin** — `/nizam` → **Users** tab edits credits/plan/ban via `/api/admin/users`.

### Real-time reflection

- **Near-real-time (always on):** `useLiveRefresh` refetches on tab focus +
  every 15 s.
- **True push (when `SUPABASE_JWT_SECRET` is set):** the **session fabric**
  (`src/lib/supabase-token.ts`) mints a Supabase JWT (`sub` = profile id,
  `role: authenticated`) from the better-auth session. The browser
  (`useRealtimeProfile`) then subscribes to its own `ir_user_profiles` row over
  Supabase Realtime. The RLS policy `auth.uid() = id` and the `supabase_realtime`
  publication already exist, so user/DB/admin changes propagate sub-second.

## 7. Deploying to production (Vercel)

Production (`www.instarishta.me`) is a Vercel project built from the `irge`
GitHub repo. Set these in **Vercel → Project → Settings → Environment Variables**
(NOT `.env.local`), then redeploy:

```
DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL=https://www.instarishta.me,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_GOOGLE_CLIENT_ID,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
RESEND_API_KEY, RESEND_FROM, ADMIN_EMAILS, SUPABASE_JWT_SECRET (optional)
```

`BETTER_AUTH_URL` must be the canonical host (`https://www.instarishta.me`, since
the apex 307-redirects to www). The Google redirect URIs for both apex + www are
already registered. Migrations 002–004 apply to the shared Supabase DB (already
done). Deploy = merge `nizam-rebuild` into the branch Vercel builds, push.
