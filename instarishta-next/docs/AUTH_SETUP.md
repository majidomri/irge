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

---

## 8. Phone sign-in (SMS OTP), verified by Firebase

### Why Firebase and not an SMS gateway

A2P SMS to Indian numbers requires **DLT registration (TRAI)** — a principal
entity, a registered header, and a registered template on every operator portal
— and DLT onboarding needs entity KYC (PAN + GST / incorporation / Udyam). Every
aggregator that makes *you* the sender (MSG91, Gupshup, Kaleyra, Twilio for
Indian traffic) eventually routes you into that.

With Firebase Phone Auth, **Google is the sender of record**: it owns the DLT
registration and the templates, and we never touch an SMS gateway. That makes it
the one phone-OTP path that works before the business is registered.

Firebase is a **verifier**, not our auth system. It proves the number; the
session cookie, the `betterauth.user` row, and every API gate stay better-auth's.

### The flow

```
browser                                   Firebase              our server
  │  sendPhoneOtp(+91…)  ──────────────────▶  sends SMS
  │  user types 6 digits ──────────────────▶  checks code
  │  ◀────────────────── Firebase ID token (signed JWT, phone_number claim)
  │
  │  POST /api/auth/phone-number/verify { phoneNumber, code: <ID token> } ─────▶
  │                                              verifyOTP → jose signature check
  │  ◀───────────────────────────── better-auth session cookie ────────────────
```

The `code` field carries the **Firebase ID token**, not six digits. better-auth's
`phoneNumber` plugin exposes a `verifyOTP` hook precisely for providers that own
their own OTP lifecycle; supplying it bypasses the plugin's internal OTP store
entirely. Everything after the hook returns `true` is stock better-auth:
find-or-create the user by phone number, create the session, set the cookie.

| File | Role |
| --- | --- |
| `src/lib/firebase-phone.ts` | Browser: sends the SMS, confirms the code, returns the ID token. Firebase SDK is dynamically imported so it stays out of the main bundle. |
| `src/lib/firebase-verify.ts` | Server: verifies the ID token against Google's JWKS with `jose`. |
| `src/lib/auth.ts` | `phoneNumber({ verifyOTP, signUpOnVerification, … })`. |
| `src/components/AuthModal.tsx` | The two-step UI (`phone` → `otp` modes). |
| `supabase/migrations/022_…sql` | `phoneNumber` + `phoneNumberVerified` on `betterauth."user"`. |

### Firebase console setup (~10 minutes, no company needed)

1. **console.firebase.google.com** → *Add project*. A personal Google account is
   fine.
2. **Build → Authentication → Sign-in method → Phone → Enable.**
3. **Project settings → General → Your apps → Web (`</>`)** → register the app →
   copy `apiKey`, `authDomain`, `projectId` into `.env.local`.
4. **Authentication → Settings → Authorized domains** → add `localhost`,
   `instarishta.me`, `www.instarishta.me`. reCAPTCHA refuses to run anywhere
   else, and the failure surfaces as `auth/unauthorized-domain`.
5. **Upgrade to the Blaze plan.** Phone auth needs it past the small free daily
   quota. A card is required; a registered business is not.
6. *(Testing)* **Authentication → Sign-in method → Phone → Phone numbers for
   testing** — register a fake number + fixed code to develop without burning
   real SMS.

Set the four env vars (see `.env.local.example`), apply migration `022`, restart.
With any of them missing, the phone button is hidden client-side and
`/phone-number/verify` refuses everything server-side — it fails closed, quietly.

### Security notes

These are load-bearing; read before changing any of them.

- **`sign_in_provider` must be `phone`.** A token minted by Google, email, or
  anonymous sign-in *in the same Firebase project* would otherwise pass every
  other check and let its holder claim any number.
- **The token's `phone_number` must equal the number being claimed.** Without
  that comparison, any valid token in the project signs you in as anyone.
- **Tokens are single-use and max 10 minutes old.** Firebase mints them with a
  1-hour life and they travel in a request body; `verifyOTP` records a SHA-256
  marker of each spent token in the `verification` table and rejects a replay.
- **reCAPTCHA is not optional.** SMS-pumping fraud (a bot cycling premium-rate
  numbers) bills to *us*, per message. The invisible verifier is the front line;
  `/phone-number/verify` is additionally rate-limited to 8 per 5 min per IP.
  Watch the Firebase usage graph for the first few weeks.
- **No phone number reaches a public surface.** `betterauth.user` needs an email
  and a name that a phone signup does not have, and `/api/comments` falls back
  to `user.name`, then to `user.email.split('@')[0]`, for a comment's author
  name. So the placeholders are an HMAC-derived opaque address
  (`p_<hmac>@phone.instarishta.local`) and a masked name (`+91 98•••••210`) —
  **never** the raw number. Keyed with `BETTER_AUTH_SECRET` because a plain hash
  of a 10-digit space is trivially reversible.

### Linking a number to an existing account

`/account` renders `PhoneLink` (`src/components/PhoneLink.tsx`) — the same
Firebase round-trip as sign-in, but posted with `updatePhoneNumber: true`, which
makes better-auth attach the verified number to the **current session's user**
instead of finding-or-creating one by number. That is what joins a Google or
email account to a phone. better-auth refuses if the number already belongs to
someone else (`PHONE_NUMBER_EXIST`), which the form surfaces verbatim.

There is no self-serve unlink or change-number: both would be a one-click way out
of the credit gate below. Clear `betterauth."user"."phoneNumber"` by hand if
someone genuinely changes their number.

### The credit gate

**A member who has paid must have a verified mobile before they can spend a
contact credit.** Free welcome credits are untouched — the gate exists because
money changed hands, not to tax the free tier.

The rule and both enforcement points live in `src/lib/phone-gate.ts`:

| | |
| --- | --- |
| Who it applies to | `hasPurchased()` — an active term plan, a grandfathered legacy tier, or any `bonus_credits`. Since migration 023 there are no free contact credits, so in practice this is everyone who can spend |
| Who is exempt | `isGrandfathered()` — `plan_started_at` (or, for a legacy refill-only buyer, the profile's `created_at`) earlier than `PHONE_GATE_FROM`. They paid under rules that never mentioned a phone number. Not permanent: `plan_started_at` moves to `now()` on every activation, so a RENEWAL after the cutoff is a fresh purchase under the new rule |
| Where it is enforced | `POST /api/account/consume` (`feature: 'contact'`) and `POST /api/interests/reveal` — the only two places a contact credit is spent |
| What it returns | `403 { code: 'phone_verification_required' }` |
| What is never gated | audio, profile views, sending interests — none of those are what was bought |

**Why the gate is on spending, not on granting.** Credits go live the instant a
member claims payment, before any human has looked at the ledger (008 §4).
Withholding the *grant* until a phone is verified would mean money leaves the
member's account and nothing visibly arrives — the worst thing a checkout can do.
So the grant is untouched: the credits are theirs, visible on `/account`, and
only the first spend waits. Locked, not missing.

Four surfaces tell the same story, all fed by `profile.phone.locked` from
`/api/account/profile`:

- **`/pay/[id]`** after claiming — "Your credits are ready", and the primary
  button becomes *Verify my mobile & unlock* → `/account`.
- **`/account`** — `PhoneLink` sits above the credit stats, and the contacts stat
  reads *Locked — verify your mobile above to spend these*.
- **`/profiles`** — `useContactCredits` knows `phoneLocked` up front, so tapping
  Contact opens `PhoneGateModal` (the same form in a sheet) rather than the
  out-of-credits upsell. `consume()` returns an outcome (`'ok' | 'phone_required'
  | 'no_credits' | 'error'`), not a boolean, so a 403 can never be mistaken for
  an empty balance and send a paying member to the upgrade screen.
- **`/account` → My interests** — a reveal blocked by the gate points at the card
  on the same page.

**The cutoff** defaults to `2026-08-28T00:00:00Z` in `phone-gate.ts` and is overridable per environment with `PHONE_GATE_FROM` (any Date-parseable string) — handy for testing the gate against a staging account. An unparseable value falls back to the built-in constant rather than to "gate nobody", so a typo cannot silently disarm it.

**Turning it off:** with `FIREBASE_PROJECT_ID` unset, `phoneGateBlocks()` returns
`false` before it checks anything else — it FAILS OPEN. That is deliberate and
load-bearing: `PhoneLink` renders nothing without the `NEXT_PUBLIC_FIREBASE_*`
vars, so a gate that stayed armed would take a member's money and leave them
holding credits they cannot spend with no form to fix it. This is a business
rule, not a security control, and the right failure is to let the paying
customer through. Set the env to arm the gate.

**To gate free credits too** (not the current behaviour): make `hasPurchased()`
return `true` unconditionally. Consider the cost first — it puts an SMS in front
of a new visitor's first contact unlock.

### Known limitation: phone and Google are separate accounts

A user who signs in by phone gets a distinct `user` row from the same person
signing in with Google, because account linking is keyed on email and a phone
signup has only a placeholder one. The remedy is the `/account` linking card
above: a Google user who verifies
their number there ends up with one account holding both. What is still missing
is the reverse — a phone-first user has no way to attach an email/Google
identity, so they keep the placeholder address until they do.

Phone users also start with a masked-number display name, so `/account` should
prompt them to set a real one before they comment.
