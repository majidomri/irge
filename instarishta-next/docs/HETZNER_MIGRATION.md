# InstaRishta → Hetzner Cloud: Migration & Build Plan

**Status:** proposal, not yet started
**Author:** drafted 2026-08-26
**Scope:** move the whole production stack (Next.js app, Postgres, cron, cache, TLS) off Vercel + Supabase onto self-managed Hetzner Cloud.

This is written as a *clean-slate build* — how the system would be designed if we were standing it up on Hetzner from nothing — with a migration path that gets the running site there without downtime. Where the existing code forces a compromise, that is called out explicitly rather than hidden.

---

## 1. What we actually run today

Everything below was verified against the live code and database on 2026-08-26, not assumed.

### 1.1 Application

| Property | Value |
|---|---|
| Framework | Next.js **16.2.4** (App Router, Turbopack) |
| React | 19.2.4 |
| Node | 22.17.0 |
| API routes | **42**, all under `src/app/api/**` |
| Edge-runtime routes | **zero** — `grep` for `runtime = 'edge'` returns nothing |
| Rendering | SSR + ISR (`unstable_cache`, `revalidate: 1800`, tag-based purge) |

**The single most important fact for this migration: there is no edge runtime anywhere.** Every route is Node. Nothing in the app depends on Vercel-specific primitives. This is an ordinary long-running Node server, which means self-hosting is a packaging exercise, not a rewrite.

### 1.2 Data

Postgres on Supabase project `cxgxyqxeakjrghfzkuko`:

| Schema | Tables | Purpose |
|---|---|---|
| `public` | 18 | All application data (`ir_*`) |
| `betterauth` | 6 | better-auth's `user` / `session` / `account` / `verification` |
| `auth` | 23 | Supabase GoTrue — **unused**, we authenticate with better-auth |
| `storage` | 8 | Supabase Storage — **unused**, zero `.storage.from()` calls in the codebase |

Row counts in `public`, largest first:

```
ir_nano_ids              38     ir_share_events           3
ir_user_profiles         17     ir_biodata                0
ir_comments               8     ir_highlights             0
ir_notifications          8     ir_featured               0   ← the missing ads
ir_channels               6     ir_user_usage             0
ir_orders                 5     ir_interests              0
ir_stories                5     ir_reports                0
ir_professions            5     ir_verification_requests  0
ir_posts                  4     ir_story_views            0
```

**Total application data is roughly one megabyte.** The entire `public` schema fits in a `pg_dump` that transfers in under a second. This changes the character of the migration completely: there is no data-volume risk, no multi-hour copy, no need for logical replication or dual-write. The hard part is behavioural parity, not moving bytes.

### 1.3 Which Supabase features we are actually using

This is the crux of the migration, so it is worth being precise:

| Feature | Used? | Notes |
|---|---|---|
| Postgres | **Yes** | The real dependency |
| PostgREST (`supabase-js` queries) | **Yes** | Server-side in `lib/data.ts`, `lib/credits.ts`; client-side in exactly **two** files |
| Row Level Security | **Yes** | 20 policies across 14 tables |
| Realtime | **Yes** | Channel post feed (`lib/supabase.ts:184`) and live credits (`useRealtimeProfile.ts`) |
| `service_role` key | **Yes** | Server-side privileged writes |
| Supabase Auth (GoTrue) | **No** | better-auth owns auth entirely |
| Supabase Storage | **No** | No calls anywhere |
| Edge Functions | **No** | None deployed |

Client-side `supabase-js` usage is remarkably small — `getDb()` appears in only **two files**: `src/components/FeaturedCarousel.tsx` and `src/lib/supabase.ts`. That is the whole browser-side surface. Everything else already goes through our own API routes.

That small surface is what makes dropping Supabase realistic rather than a six-month project.

### 1.4 Auth

better-auth talking to Postgres over a **direct `pg` Pool** (`src/lib/auth.ts`), with `search_path=betterauth`. Providers: Google OAuth + magic link via Resend.

It does **not** use `supabase-js` — it uses `DATABASE_URL` against raw Postgres. Auth therefore migrates by changing one connection string. This is the easiest part of the whole move.

One sharp edge, already documented in `.env.local`: the connection **must** use the Session pooler (port 5432), not the Transaction pooler (6543), because the `search_path` SET would not persist across per-transaction backends. Self-hosting removes this constraint entirely — we control the pooler.

### 1.5 The session-fabric bridge

`GET /api/auth/supabase-token` mints a short-lived **HS256 Supabase JWT** (signed with `SUPABASE_JWT_SECRET`) so the browser can talk to Supabase Realtime and satisfy RLS *as the better-auth user*. `profileId` (`ir_user_profiles.id`) is the RLS subject.

This bridge exists **solely to reconcile two identity systems**. It is pure accidental complexity created by using better-auth alongside Supabase. On a self-hosted stack where we own both ends, it disappears.

### 1.6 Everything outside the app

| Component | Where it lives | Migrate? |
|---|---|---|
| `instarishta-profile-relay` Worker + KV | Cloudflare | Phase 5 — optional |
| Profile feed source | `raw.githubusercontent.com/majidomri/irge/main/jsdata.json` | No — stays |
| 4 cron routes | Externally pinged, `CRON_SECRET`-authenticated | Yes → systemd timers |
| Resend | SaaS | No |
| Google OAuth | SaaS | Redirect URIs need updating |
| Telegram bot webhook | SaaS | Webhook URL needs updating |
| `next/image` optimization | Vercel (billed per transform) | Yes → sharp on-box |

The Cloudflare Worker deserves a note. It is not merely a cache — it also enforces an origin allowlist against browser scrapers, does lead capture with rate limiting and a form-age honeypot, relays to Telegram, and keeps visitor metrics in KV. It caches `jsdata.json` for 5 minutes. Folding this into the Next app is genuinely optional and is deliberately sequenced **last**.

### 1.7 Migration blockers already in the code

Two hardcoded values will break the moment the Supabase hostname changes:

1. **`src/lib/db.ts:15-16`** — the Supabase URL *and* publishable key are string literals, not env vars:
   ```ts
   const SUPABASE_URL  = 'https://cxgxyqxeakjrghfzkuko.supabase.co';
   const SUPABASE_ANON = 'sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis';
   ```
2. **`next.config.ts`** — `images.remotePatterns` hardcodes `cxgxyqxeakjrghfzkuko.supabase.co`.

Both must be env-driven **before** Phase 0 ends. They are five-minute fixes that become multi-hour outages if discovered at cutover.

---

## 2. Target architecture

### 2.1 The central design decision

There are two coherent ways to land on Hetzner, and picking one up front determines everything downstream.

**Option A — Self-host the Supabase stack.** Run `supabase/postgres`, GoTrue, PostgREST, Realtime, and Kong via Docker Compose. Application code changes almost nothing: swap the URL and keys, keep RLS, keep `supabase-js`, keep the JWT bridge.

**Option B — Drop Supabase; run plain Postgres.** Delete `supabase-js`. Move the two client-side call sites behind our own API routes. Replace RLS with authorization in the API layer (where 42 routes already enforce it). Replace Realtime with SSE. Delete the JWT bridge.

**Recommendation: Option B.**

The reasoning is specific to this codebase, not general preference:

- The client surface is two files. Option B's "big rewrite" is a few hundred lines.
- We use **none** of GoTrue and **none** of Storage — self-hosting the full Supabase stack means operating (and patching, and backing up) five containers to get value from roughly one and a half of them.
- RLS is currently doing double duty with API-route authorization. Two enforcement points that must agree is a standing security risk, and the JWT bridge exists only to make them agree.
- Self-hosted Supabase Realtime is the single most operationally fragile component in that stack. Our realtime needs are one channel feed and a credits counter — both are a textbook fit for Server-Sent Events over the Postgres `LISTEN/NOTIFY` we can already use.
- Option B is what we would build if starting from scratch, which is exactly what was asked for.

The honest cost of Option B: it is **more up-front work** and it moves authorization from the database into the application. If the team's confidence in API-layer authorization is low, Option A is the safer choice and remains a legitimate answer. Phases 0–2 below are identical either way, so this decision can be deferred until Phase 3.

The rest of this plan assumes **Option B**.

### 2.2 Target topology

```
                    Cloudflare (DNS, WAF, CDN, DDoS)
                              │
                              ▼
        ┌──────────────── Hetzner Cloud ─────────────────┐
        │                                                │
        │   ┌── Caddy ──────────────────────────────┐    │
        │   │  TLS termination, HTTP/3, compression │    │
        │   │  security headers, rate limiting      │    │
        │   └───────────────┬───────────────────────┘    │
        │                   │                            │
        │     ┌─────────────┴──────────────┐             │
        │     ▼                            ▼             │
        │  ┌──────────┐              ┌──────────┐        │
        │  │ next-blue│              │ next-green│       │
        │  │  :3000   │              │  :3001    │       │
        │  └────┬─────┘              └─────┬────┘        │
        │       └──────────┬───────────────┘             │
        │                  ▼                             │
        │   ┌────────────┐    ┌────────────┐             │
        │   │ PgBouncer  │    │  Valkey    │             │
        │   │  :6432     │    │  :6379     │             │
        │   └─────┬──────┘    └────────────┘             │
        │         ▼                                      │
        │   ┌────────────────────────┐                   │
        │   │  Postgres 17           │                   │
        │   │  + pg_cron             │                   │
        │   │  data on attached vol  │                   │
        │   └────────────────────────┘                   │
        │                                                │
        │   systemd timers → cron routes                 │
        └────────────────────────────────────────────────┘
                              │
                              ▼
              Hetzner Storage Box (pgBackRest) + offsite
```

Two app containers (blue/green) give zero-downtime deploys. Caddy handles TLS so we never touch certbot. Valkey replaces the `_dev` in-process Map and gives us a shared ISR/profile cache that survives restarts and is shared across both containers — something Vercel gave us implicitly and we would otherwise silently lose.

### 2.3 Sizing and cost

Prices are approximate EUR/month, ex-VAT, and should be re-checked against Hetzner's current list before purchase.

| Item | Spec | ~Cost |
|---|---|---|
| **CPX31** app+db server | 4 vCPU AMD, 8 GB RAM, 160 GB NVMe | €16 |
| Volume (Postgres data) | 40 GB | €2 |
| Storage Box BX11 | 1 TB backups | €4 |
| Snapshots | ~3 × server image | €2 |
| Cloudflare | Free tier | €0 |
| **Total** | | **~€24/mo** |

Start on **CPX31**. The workload is one Node process serving ~500 SSR'd profiles plus `sharp` image optimization; 4 vCPU is comfortable and the data is a megabyte. Add a second server and split Postgres onto **CCX13** (dedicated vCPU) only when measurements justify it — not preemptively.

Watch one thing specifically: `next/image` transforms were Vercel's bill and become **our CPU**. `minimumCacheTTL` is already 31 days and `deviceSizes`/`imageSizes` are already trimmed (good — that work is done), so steady-state cost is low, but the first crawl after a deploy will spike. Mitigate by persisting `.next/cache/images` on a volume across deploys and letting Cloudflare absorb repeats.

**Single-server caveat, stated plainly:** this topology has no high availability. A hardware failure or a bad kernel upgrade is a full outage until a snapshot restores. For this business that is very likely the right trade at €24/mo versus €200+/mo for a genuinely redundant setup — but it should be a decision, not a surprise. Section 8 covers the restore drill that makes it survivable.

---

## 3. Phase 0 — Prepare the codebase (no infrastructure yet)

Do all of this on a branch, merged and running on Vercel, **before** provisioning anything. Every item here is a change that is safe to ship today and that removes a cutover risk.

- [ ] **Un-hardcode Supabase config.** `src/lib/db.ts` must read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env. Ship and verify on Vercel.
- [ ] **Un-hardcode the image host.** Drive `next.config.ts` `remotePatterns` from an env var so the storage hostname is not baked into the build.
- [ ] **Inventory every env var** into `.env.example` with a comment per var. There are 23 in `.env.local` today; all must be accounted for or explicitly retired.
- [ ] **Add `/api/health`.** Returns 200 only when Postgres answers `SELECT 1` and the profile feed cache is warm. Caddy and the deploy script both depend on this; write it first.
- [ ] **Add structured logging.** The `loaderFailed()` helper added to `lib/data.ts` is the pattern — extend it. Self-hosting means no Vercel dashboard; if a failure is silent it is invisible. This is not optional polish, it is the difference between a 5-minute and a 5-hour incident.
- [ ] **Pin Node to 22.17.0** in `package.json` `engines` and in the Dockerfile. Do not float.
- [ ] **Write the Dockerfile** (multi-stage, `output: 'standalone'`) and verify `docker build && docker run` serves the site locally against the *existing* Supabase.

That last point matters: by the end of Phase 0 the app runs in a container against production Supabase. Every later phase changes one variable at a time.

> **Note on Next.js 16.** Per `AGENTS.md`, this is not a Next.js version to work from memory on. `output: 'standalone'` and the Turbopack build path both need checking against `node_modules/next/dist/docs/` before the Dockerfile is written — the standalone output contract and its file-tracing behaviour are exactly the sort of thing that shifted between majors.

**Exit criteria:** container builds, runs locally, serves all routes, `/api/health` green, zero hardcoded infrastructure hostnames in the repo.

---

## 4. Phase 1 — Provision Hetzner

- [ ] Create project; add SSH keys; **disable password auth**.
- [ ] Provision CPX31, Nuremberg or Helsinki (both fine for an India-facing audience once Cloudflare fronts it; Cloudflare's edge, not the origin, determines perceived latency).
- [ ] Attach a 40 GB volume, mount at `/var/lib/postgresql`, `ext4`, in `/etc/fstab`.
- [ ] **Cloud Firewall** (Hetzner's, at the network edge — not just `ufw`): inbound 22 from your IP only, 80/443 from Cloudflare IP ranges only. Everything else denied. Postgres 5432 is **never** exposed.
- [ ] Also configure `ufw` on-host as defence in depth.
- [ ] `unattended-upgrades` for security patches; `fail2ban` on sshd.
- [ ] Enable automatic weekly snapshots.
- [ ] Create a non-root deploy user; Docker via the official repo.

**Exit criteria:** you can SSH in, `docker run hello-world` works, and a port scan from outside shows only 80/443.

---

## 5. Phase 2 — Postgres

- [ ] Run **Postgres 17** in Compose, data on the attached volume, `shared_buffers=2GB`, `effective_cache_size=6GB`, `max_connections=100`.
- [ ] **PgBouncer** in transaction mode on 6432. Note: better-auth's `search_path` requirement means the auth pool must use **session** mode (or set `search_path` per-connection via the connection string's `options=` parameter). Get this right in staging — it is the exact failure the `.env.local` comment warns about, and it fails at *runtime*, not at connect.
- [ ] Install `pg_cron`.
- [ ] **pgBackRest** → Hetzner Storage Box: full weekly, incremental daily, WAL archiving continuous. Retain 30 days.
- [ ] Second offsite copy (Backblaze B2 or S3) — a backup on the same vendor as the server is not an offsite backup.
- [ ] **Restore drill.** Restore into a throwaway container and run the app against it. A backup that has never been restored is a hypothesis, not a backup.

### Schema migration

```bash
# Roles first (RLS policies reference them; dump will fail to apply without)
pg_dumpall --roles-only -d "$SUPABASE_URL" > roles.sql

# public schema — the application data
pg_dump -Fc --schema=public --no-owner --no-acl "$SUPABASE_URL" > public.dump

# betterauth schema — sessions, accounts, users
pg_dump -Fc --schema=betterauth --no-owner --no-acl "$SUPABASE_URL" > betterauth.dump
```

Do **not** dump the `auth` or `storage` schemas. They are Supabase-internal, unused by us, and carrying them over imports 31 tables of dead weight plus GoTrue's own triggers.

Under Option B the RLS policies come across but stop being the enforcement boundary. Do not drop them in this phase — keep them as defence in depth until Phase 3 has proven API-layer authorization, then decide deliberately.

`anon` and `authenticated` roles do not exist outside Supabase; create them as plain roles so the policy definitions apply cleanly, even though nothing will authenticate as them once PostgREST is gone.

**Exit criteria:** schema restored, row counts match source exactly, `betterauth` tables queryable, backup taken *and restored*.

---

## 6. Phase 3 — Cut the Supabase dependency

The application work. Sequenced so each step is independently shippable and reversible.

**3a. Server-side reads.** Rewrite `lib/data.ts` (`getProfiles`, `getFeatured`, `getBiodata`) and `lib/credits.ts` to use `pg` directly instead of `supabase-js`. These are the loaders already touched by the error-logging work, so the shape is familiar. Keep `unstable_cache` — it is a Next feature, not a Vercel one, and works identically self-hosted.

**3b. Client-side reads.** Only two files:
- `FeaturedCarousel.tsx` — its client-side fallback query becomes `GET /api/featured`. Note the server already passes `initialItems`, so this fallback fires only when the server returned empty; it is close to dead code and could arguably just be deleted.
- `lib/supabase.ts` — the larger job. ~20 exported functions (`getChannels`, `getPosts`, `incrementLikes`, `createStory`, …) each become an API route or a server action. Mechanical, but this is the bulk of the phase.

**3c. Realtime → SSE.** Replace `subscribeChannel` and `useRealtimeProfile` with `GET /api/stream` (Server-Sent Events) backed by Postgres `LISTEN/NOTIFY`. Triggers on `ir_posts` and `ir_user_profiles` issue `pg_notify`; one listener connection fans out to subscribers.

SSE over WebSockets deliberately: it is one-directional (which is all we need), survives proxies without special Caddy config, and reconnects natively in the browser. The existing focus+poll fallback in `useContactCredits.ts` stays as the safety net — it already exists and already works.

**3d. Delete the bridge.** Remove `/api/auth/supabase-token`, `lib/supabase-token.ts`, and `SUPABASE_JWT_SECRET`. With one identity system there is nothing to bridge.

**3e. Remove the dependency.** Drop `@supabase/supabase-js` and `@supabase/ssr` from `package.json`. `grep -r "supabase"` across `src/` should return only comments and this document.

**Exit criteria:** app runs fully against local Postgres with no Supabase package installed; all 42 API routes exercised; auth round-trip (Google + magic link) verified; realtime verified in two browsers.

---

## 7. Phase 4 — Deploy pipeline, cron, cutover

### Pipeline
GitHub Actions → build image → push to GHCR → SSH to host → pull → start the idle colour → poll `/api/health` → flip Caddy upstream → stop the old colour. Keep the previous image tagged so rollback is one command.

### Cron
Four routes replace Vercel cron with systemd timers. Keep `CRON_SECRET` — the routes already fail closed without it, which is the correct design and should not be relaxed just because the caller is now local.

| Route | Schedule |
|---|---|
| `/api/cron/profiles-refresh` | `*/15 * * * *` |
| `/api/cron/orders` | hourly |
| `/api/cron/renewals` | daily 09:00 IST |
| `/api/cron/cohort-counts` | daily 03:00 |

Use systemd timers rather than `pg_cron` + `pg_net` for these: they call HTTP endpoints, and a timer's failures land in `journalctl` where the rest of the operational logging lives.

### Cutover

Because the dataset is ~1 MB, this is a short read-only window, not a replication exercise.

1. Announce a 15-minute maintenance window (low traffic, roughly 03:00 IST).
2. Update Google OAuth redirect URIs and the Telegram webhook URL to the new origin **in advance** — these propagate independently of DNS and are a classic cutover surprise.
3. Lower the Cloudflare DNS TTL to 60s, 24h ahead.
4. Put the Vercel deployment into read-only (feature flag or maintenance page).
5. Final `pg_dump` → restore to Hetzner. Verify row counts table by table.
6. Flip the Cloudflare origin to the Hetzner IP (proxied, orange cloud).
7. Smoke test: sign in with Google, sign in with magic link, browse `/profiles`, apply a filter, open a channel, verify realtime, hit `/pay/[id]`, trigger one cron route by hand.
8. Watch logs and error rates for 60 minutes before declaring done.
9. **Keep the Vercel deployment and the Supabase project alive, untouched, for 30 days.** Rollback is a DNS flip back — but only while both still exist. Do not cancel early to save €20.

---

## 8. Phase 5 — Optional: fold in the Cloudflare Worker

Deliberately last, and genuinely optional.

Moving `instarishta-profile-relay` into Next means reimplementing: the origin allowlist, 5-minute `jsdata.json` caching (Valkey replaces KV), lead-capture rate limiting and the form-age honeypot, Telegram relay, and visitor metrics.

**The case against moving it:** it costs nothing on Cloudflare's free tier, it runs at the edge closer to users than a single German origin ever will, and — most importantly — it absorbs scraper traffic *before* it reaches our one server. On a single-server topology that buffer has real value.

**Recommendation: leave it on Cloudflare.** Revisit only if the split ownership becomes an operational problem. "Everything on Hetzner" is an aesthetic goal, not an engineering one.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PgBouncer breaks better-auth `search_path` | **High** | Auth fully down | Session mode for the auth pool; prove in staging |
| Single server hardware failure | Low | Full outage | Snapshots + tested restore; accept, or add HA later |
| `next/image` CPU spike after deploy | Medium | Slow pages | Persist image cache across deploys; Cloudflare in front |
| Missed hardcoded Supabase reference | Medium | Broken feature at cutover | Phase 0 audit; `grep -r supabase` gate in CI |
| Realtime regression in SSE rewrite | Medium | Stale feed/credits | Existing poll fallback stays; verify in two browsers |
| RLS removed before API authz is solid | Low | **Data exposure** | Keep policies through Phase 3; remove only deliberately |
| Backups never restore-tested | Low | **Total data loss** | Mandatory drill in Phase 2, repeated quarterly |
| Google OAuth URIs not updated | Medium | Sign-in down | Update *before* the window, not during |

The two rows in bold are the ones that end the business rather than ruin a day. Treat their mitigations as non-negotiable gates, not checklist items.

---

## 10. Sequencing

| Phase | Work | Depends on |
|---|---|---|
| 0 — Codebase prep | 2–3 days | — |
| 1 — Provision | 0.5 day | — (can run parallel to 0) |
| 2 — Postgres | 1–2 days | 1 |
| 3 — Cut Supabase | **4–7 days** | 0, 2 |
| 4 — Pipeline + cutover | 2 days | 3 |
| 5 — Worker (optional) | 2 days | 4 |

**Roughly two working weeks** for phases 0–4, with Phase 3 as the dominant and most variable cost. Phase 3 is also the only phase that can be shipped incrementally to production on Vercel *before* the move — doing so de-risks the cutover substantially and is strongly recommended over big-bang.

If Option A (self-hosted Supabase) is chosen instead, Phase 3 collapses to about a day and the total drops to roughly a week — at the cost of permanently operating five containers for two features. That trade is the real decision this document exists to frame.

---

## 11. Open questions

1. **Option A or B?** Decidable as late as the start of Phase 3.
2. **Is single-server acceptable for the next 12 months?** Determines whether Phase 1 provisions one box or a pair plus a load balancer.
3. **Who is on call?** Vercel and Supabase were absorbing operational burden that now becomes ours. This is the largest hidden cost of the move and does not appear in the €24/mo figure.
4. **Does the UPI checkout path have any origin-coupled assumptions?** `/pay/[id]` has a known production bug (users bounced, no working purchase path). That should be fixed *before* migrating, so the two problems are never being debugged simultaneously.
5. **Retire the `ir_nano_ids` / share-card flow, or carry it over as-is?** 38 rows; worth a look while we are touching every data path anyway.
