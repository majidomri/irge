# InstaRishta — Subscription Pricing Plan

Replaces the 4-tier one-time packages (Silver / Gold / Diamond / Platinum) with
**two prepaid subscription terms** whose contact credits **reset every month**
for the life of the term.

---

## 1. Why this change

Two problems with the current model:

1. **The two paid surfaces disagree.** `/pricing` sells ₹499–₹11,000 packages;
   the actual UPI checkout (`PaymentModal.tsx`) sells ₹99–₹349 packs. That is a
   ~10× gap on the same product. Whichever a user sees first sets their price
   anchor, and the other one looks like a mistake.
2. **One-time credit packs reward hoarding, not engagement.** A user buys 500
   unlocks, burns 40, and never comes back. Revenue is one-shot and there is no
   reason to open the app next month.

A term subscription with a monthly reset fixes both: one price list, and a
reason to return every month (your credits just refilled).

---

## 2. The catalog

| | **Free** | **Rishta 6** | **Rishta 12** |
|---|---|---|---|
| Price | ₹0 | **₹2,199** | **₹4,499** |
| Term | — | 6 months | 12 months |
| Contact credits | 10 (one time, never resets) | **30 / month** | **40 / month** |
| Total credits over term | 10 | 180 | **480** |
| Cost per credit | — | ₹12.22 | **₹9.37** |
| Audio plays | 30 / hour | 30 / hour | 30 / hour |
| Profile views | Unlimited | Unlimited | Unlimited |
| Verified badge | — | ✅ | ✅ |
| Priority listing | — | — | ✅ |
| Support | Email | WhatsApp | Priority WhatsApp |

### How to present these two — important

At these prices the monthly maths runs **against** the annual plan: ₹2,199 ÷ 6 =
**₹366/mo** vs ₹4,499 ÷ 12 = **₹375/mo**. Buyers expect the longer term to be
cheaper per month, so a "₹/month" line on the cards actively argues for Rishta 6.

Rishta 12 wins decisively on the two axes that matter more:

- **₹9.37 per credit vs ₹12.22** — 23 % cheaper per unlock
- **480 unlocks vs 180** — 2.7× the total reach

So the pricing cards and the compare table should show **cost per credit** and
**total credits**, and should *not* show an effective-monthly figure. Headline
copy for Rishta 12: *"480 contacts across the year — ₹9 each"*, with the badge
**Best Value** (true on per-credit) rather than "cheaper per month" (false).

If you would rather have the conventional "annual is cheaper every way" story,
Rishta 12 needs to land at ₹4,199 or below (₹350/mo). Flagging it as a choice,
not a blocker — the plan below works either way.

**Optional add-on — Top-up pack: ₹349 for 25 extra credits.** For the
subscriber who burns their month early. These credits are *persistent* (they do
not reset and do not expire with the cycle), so they need their own column —
see §4. This keeps the "I need more right now" revenue without reintroducing a
tier ladder.

₹349 is chosen so the pack prices at **₹13.96/credit — above both plans**
(₹12.22 and ₹9.37). A top-up must always be the expensive way to get credits,
or it cannibalises the upgrade. At ₹299 it would land at ₹11.96, *undercutting*
Rishta 6's own per-credit rate, which would make topping up the rational move
for every 6-month member.

### Anchoring note

Current Diamond is ₹4,999 for 150 days. Rishta 12 at ₹4,499 for 365 days is
₹500 cheaper for 2.4× the term, which makes the migration announcement easy to
write.

---

## 3. Reset mechanics

The rule, in user-facing words:

> Your credits refill to the full monthly amount on the same date each month.
> Unused credits **do not carry over**. When your term ends, credits stop
> refilling.

Precisely:

- **Anchor** — the reset day is the day-of-month you subscribed
  (`plan_started_at`). Cycle *n* begins at `plan_started_at + n months`.
  Postgres month arithmetic clamps correctly off the anchor (31 Jan + 1 month =
  28 Feb, + 2 months = 31 Mar), so a 31st-of-the-month subscriber does not
  permanently drift to the 28th.
- **No rollover.** A reset *sets* the balance to the allowance, it does not add
  to it. This is the whole point of a time-bound reset — it caps liability and
  creates monthly urgency.
- **Missed cycles collapse.** A user who does not open the app for 3 months
  gets one reset to the allowance on return, not three months of stacked
  credits.
- **Idempotent.** Each profile stores `cycle_index` = the cycle its balance was
  last funded for. A sync only grants when the computed current cycle is ahead
  of the stored one, so it is safe to run on every request.
- **Expiry.** At `plan_expires_at` the plan reverts to `none`, allowance goes to
  0, cycle credits go to 0. Purchased top-up credits survive.

### No auto-renewal — deliberately

Payment is manual UPI + admin verification. So this is a **prepaid membership
with a monthly usage allowance**, not an auto-debit subscription. That is worth
keeping: recurring UPI/card mandates in India pull in RBI e-mandate
requirements (pre-debit notification, mandate registration, ₹15,000 AFA limit).
A prepaid term sidesteps all of it. Renewal is a re-purchase, prompted in-app
at T-14 days.

---

## 4. Database changes

New migration: `supabase/migrations/005_subscription_plans.sql` (004 was already
taken by `004_betterauth_ratelimit.sql`).

### Part 0 — the bug that has to be fixed first

Verified against the live database, not inferred:

- `ir_user_profiles.id` is `UUID PRIMARY KEY REFERENCES auth.users(id)` with
  **no default**, and the FK is still in place.
- `ensureProfile()` inserted `{email, full_name, contact_credits, plan}` with no
  `id`, so every insert for a better-auth user died on a not-null violation.
- `credits.ts:77` destructured only `data` and discarded `error`, then fell back
  to a synthetic in-memory profile (`id: ''`, 20 credits) that was never saved.
- `consume()` therefore ran `UPDATE … WHERE email = …` matching **zero rows**
  and still returned `allowed: true`.

**Contact unlocks were free and unlimited for every better-auth user.** At the
time of writing, 3 of 5 better-auth users had no profile row at all; all 9
existing profiles date from the old Supabase-auth era.

No subscription can be sold on top of this, so migration 005 opens by giving
`id` a default, dropping the `auth.users` FK, adding the unique index on `email`
that `ON CONFLICT` needs, and backfilling the orphaned users. The backfill grants
**20** credits, not the new 10 — that is the balance the UI had been showing
them, and honouring it costs three users' worth of credits.

`ensureProfile` now throws instead of falling back, so this class of failure can
never be silent again.

```sql
-- Extend the plan enum; keep legacy values so existing rows stay valid.
ALTER TABLE public.ir_user_profiles DROP CONSTRAINT IF EXISTS ir_user_profiles_plan_check;
ALTER TABLE public.ir_user_profiles ADD CONSTRAINT ir_user_profiles_plan_check
  CHECK (plan IN ('none','ir6','ir12',
                  'silver','gold','diamond','platinum'));  -- legacy, read-only

ALTER TABLE public.ir_user_profiles
  ADD COLUMN IF NOT EXISTS plan_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_credits  INT DEFAULT 0,   -- allowance per cycle
  ADD COLUMN IF NOT EXISTS cycle_index      INT DEFAULT 0,   -- cycle the balance is funded for
  ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ,     -- derived, for display
  ADD COLUMN IF NOT EXISTS bonus_credits    INT DEFAULT 0;   -- top-ups; never reset
```

Column semantics:

| Column | Meaning |
|---|---|
| `contact_credits` | **cycle** balance — overwritten on every reset |
| `bonus_credits` | purchased top-ups — persistent, spent only after `contact_credits` hits 0 |
| `monthly_credits` | the plan's per-cycle allowance (0, 40, or 60) |
| `plan_started_at` | reset anchor |
| `plan_expires_at` | end of term (already exists) |
| `cycle_index` | idempotency guard for granting |
| `credits_reset_at` | next reset instant, recomputed on each sync — display only |

### Dropping the free tier 20 → 10

The number `20` is hardcoded in **six** places. All must move together or new
signups get an inconsistent balance:

```sql
-- 1. column default (001_full_schema.sql:18, 50)
ALTER TABLE public.ir_user_profiles ALTER COLUMN contact_credits SET DEFAULT 10;

-- 2. the welcome-credit trigger (001_full_schema.sql:53-61)
CREATE OR REPLACE FUNCTION public.ir_set_welcome_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.contact_credits IS NULL THEN NEW.contact_credits := 10; END IF;
  RETURN NEW;
END; $$;
```

3. `src/lib/credits.ts:16` — `USAGE_LIMITS.contact.free: 20` → `10`
4. `src/app/account/page.tsx:141` — `<UsageStat … limit={20} />` → the profile's
   `monthly_credits`, falling back to 10 for free users
5. The `ir_sync_profile` INSERT above
6. **The multi-account fraud sweep** (`001_full_schema.sql:265-268`) — see below

Existing free users keep their current balance. Only new signups get 10; there
is no reason to claw back credits already granted.

#### The fraud sweep needs fixing regardless

That sweep currently zeroes any flagged account with `contact_credits > 0 AND
contact_credits <= 20`, on the assumption that "≤ 20 means welcome credits, so
it is safe to strip." Once subscribers exist that assumption is false: a Rishta
12 member who has spent down to 18 remaining credits sits inside the range and
would be wiped. Gate it on plan instead of on the balance:

```sql
UPDATE public.ir_user_profiles
SET    contact_credits = 0, updated_at = NOW()
WHERE  id = v_uid
  AND  plan = 'none'              -- never touch a paying member
  AND  bonus_credits = 0          -- never touch purchased top-ups
  AND  contact_credits > 0;
```

This is a live bug the moment the first subscription is sold, so it ships with
migration 005, not later. (It fires on `auth.uid()`, so it is dormant for
better-auth users today — fixing it now stops it resurfacing as a support
nightmare once real money is involved.)

### The sync function

One function does ensure-row + expire + reset + return, so `ensureProfile()`
drops from two round trips to one and the whole thing is atomic:

```sql
CREATE OR REPLACE FUNCTION public.ir_sync_profile(p_email TEXT, p_full_name TEXT DEFAULT NULL)
RETURNS public.ir_user_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ir_user_profiles; n INT;
BEGIN
  INSERT INTO ir_user_profiles (email, full_name, contact_credits, plan)
  VALUES (p_email, p_full_name, 10, 'none')   -- welcome credits: 20 → 10
  ON CONFLICT (email) DO NOTHING;

  SELECT * INTO r FROM ir_user_profiles WHERE email = p_email FOR UPDATE;
  IF r.full_name IS NULL AND p_full_name IS NOT NULL THEN
    UPDATE ir_user_profiles SET full_name = p_full_name WHERE email = p_email;
    r.full_name := p_full_name;
  END IF;

  IF r.plan NOT IN ('ir6','ir12') OR r.plan_started_at IS NULL THEN RETURN r; END IF;

  -- Term over → revert to free. Bonus credits survive.
  IF now() >= r.plan_expires_at THEN
    UPDATE ir_user_profiles
       SET plan='none', monthly_credits=0, contact_credits=0,
           credits_reset_at=NULL, cycle_index=0, updated_at=now()
     WHERE email = p_email RETURNING * INTO r;
    RETURN r;
  END IF;

  -- Cycles elapsed since the anchor.
  n := (EXTRACT(YEAR  FROM age(now(), r.plan_started_at)) * 12
      + EXTRACT(MONTH FROM age(now(), r.plan_started_at)))::INT;

  IF n > r.cycle_index THEN            -- one grant, however many cycles were missed
    UPDATE ir_user_profiles
       SET contact_credits  = r.monthly_credits,
           cycle_index      = n,
           credits_reset_at = r.plan_started_at + ((n + 1) || ' months')::INTERVAL,
           updated_at       = now()
     WHERE email = p_email RETURNING * INTO r;
  ELSIF r.credits_reset_at IS NULL THEN
    UPDATE ir_user_profiles
       SET credits_reset_at = r.plan_started_at + ((n + 1) || ' months')::INTERVAL
     WHERE email = p_email RETURNING * INTO r;
  END IF;

  RETURN r;
END; $$;
```

Requires a unique index on `email` for the `ON CONFLICT` (add one if absent —
worth having regardless, since email is the better-auth ↔ profile bridge).

### Activation function

Admin-called, so activation is one atomic statement instead of four field edits
in `/nizam`:

```sql
CREATE OR REPLACE FUNCTION public.ir_activate_plan(p_email TEXT, p_plan TEXT)
RETURNS public.ir_user_profiles LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE r public.ir_user_profiles; months INT; allowance INT;
BEGIN
  SELECT CASE p_plan WHEN 'ir6' THEN 6  WHEN 'ir12' THEN 12 END,
         CASE p_plan WHEN 'ir6' THEN 30 WHEN 'ir12' THEN 40 END
    INTO months, allowance;
  IF months IS NULL THEN RAISE EXCEPTION 'Unknown plan %', p_plan; END IF;

  UPDATE ir_user_profiles
     SET plan=p_plan, plan_started_at=now(),
         plan_expires_at = now() + (months || ' months')::INTERVAL,
         monthly_credits = allowance, contact_credits = allowance,
         cycle_index = 0, credits_reset_at = now() + INTERVAL '1 month',
         updated_at = now()
   WHERE email = p_email RETURNING * INTO r;
  RETURN r;
END; $$;
```

### Nightly sweep

`ir_sync_profile` is lazy — it only runs when the user shows up. `/nizam`'s user
list and any expiry-reminder job need fresh state regardless, so add a pg_cron
job (03:00 IST) that runs the same expire/reset logic across all rows with a
non-`none` plan. Both paths are idempotent, so they cannot fight each other.

---

## 5. Application changes

| # | File | Change |
|---|---|---|
| 1 | `supabase/migrations/005_subscription_plans.sql` | ✅ **Done** — everything in §4 |
| 2 | `src/lib/plans.ts` | ✅ **Done** — the single catalog. Every surface below imports it; no more per-file `PLANS` arrays. |
| 3 | `src/lib/credits.ts` | ✅ **Done** — `ensureProfile()` → one `ir_sync_profile` RPC that throws on failure; `consume('contact')` → `ir_spend_contact_credit` RPC, cycle balance before top-ups; `ProfileState` gains `bonus_credits`, `total_credits`, `monthly_credits`, `plan_started_at`, `credits_reset_at` |
| 4 | `src/app/api/account/profile/route.ts` | ✅ **Done** — already spreads `...summary`, so the new fields flow through |
| 5 | `src/app/pricing/page.tsx` | ✅ **Done** — two cards, 5-col compare → 4-col (Free/6/12), FAQ rewritten for reset/rollover/renewal/no-refund. Cards show **cost per credit + total credits, never ₹/month** (see §2) |
| 6 | `src/app/profiles/_modals/PaymentModal.tsx` | ✅ **Done** — local `PLANS` deleted → catalog. Fixes the ₹99-vs-₹499 contradiction. Top-up offered alongside the two terms. |
| 7 | `src/app/api/payment-notify/route.ts` | ✅ **Done** — local `PLANS` deleted → catalog. Telegram message now names the exact `/nizam` action, and flags unrecognised plan ids instead of printing `?`. |
| 8 | `src/app/account/page.tsx` | ✅ **Done** — credit stat reads against the plan allowance (was hardcoded `limit={20}`) and shows `Refills in 9 days`; separate row for top-up credits; plan chip shows expiry; CTA switches to "Renew or upgrade" |
| 9 | `src/app/api/admin/users/route.ts` | ✅ **Done** — `{ id, activate: 'ir6'\|'ir12' }` → `ir_activate_plan`; `{ id, bonus_add: n }` → top-ups. Raw field editing kept for support overrides. |
| 10 | `src/app/nizam/NizamClient.tsx` | ✅ **Done** — plan dropdown → **Activate** buttons with prices; row shows cycle balance, refill countdown, expiry and top-up balance |
| 11 | `src/app/refund-policy/page.tsx`, `src/app/toc/page.tsx`, `src/app/security/page.tsx` | ✅ **Done** — rewritten as a **strict No-Refund Policy** (see §10) |

Credit-display components (`useContactCredits`, the account `UsageStat`) are
currently hardcoded to `limit={20}`; they need the allowance passed through so
the progress bar reads against 40 or 60 for subscribers.

Realtime needs nothing — the session-fabric subscription on `ir_user_profiles`
already broadcasts, so a reset lands in an open tab within a second.

---

## 6. Migrating existing users

- **Legacy plan holders** (`silver`/`gold`/`diamond`/`platinum`): grandfathered.
  Their `plan_expires_at` is honored, their credit balance is untouched, and
  they simply get no monthly reset (`monthly_credits` stays 0). The plan values
  stay in the CHECK constraint so nothing breaks. At expiry they fall to `none`
  like everyone else and see the new pricing.
- **Free users**: existing ones keep whatever balance they hold — no claw-back.
  New signups from migration day get **10** welcome credits instead of 20, still
  one-time and non-resetting. The halving matters more than it looks: 10 unlocks
  is roughly "try three or four profiles seriously," which is a demo, not a
  usable free tier. That is the intent, but it does mean the free→paid prompt
  now fires much earlier in the funnel, so `/pricing` copy carries more weight
  than it used to.
- **Goodwill option**: any legacy holder who buys a term inside the first 30
  days gets the remaining days of their old plan added on top. Cheap, and it
  converts the group most likely to feel cheated by a price change.

---

## 7. Rollout order

1. ✅ Migration 005 + the four functions — **applied and verified** against the
   live database. Backfill took profiles 9 → 12 with zero orphaned better-auth
   users; a 12-step lifecycle test (create → activate → spend → refill → missed
   cycles → top-ups → expiry → anchor clamping) passed end to end.
2. ✅ `src/lib/plans.ts`, `credits.ts` and the profile API rewired. **Ships
   alone** — 8 of 9 profiles are `plan='none'` and the ninth is legacy `silver`,
   so no live user's behaviour changes; it de-risks the schema move before any
   copy changes.
3. `/nizam` activation buttons — so support can actually sell the new plans.
4. `PaymentModal` + `payment-notify` — the checkout path, now consistent.
5. `/pricing`, `/account`, refund policy, T&C — the public copy, all at once.
6. ✅ pg_cron enabled (v1.6.4), `ir-sweep-plans` scheduled nightly at 21:30 UTC
   / 03:00 IST. T-14 renewal reminder built as `GET|POST /api/cron/renewals`
   (backed by `ir_expiring_plans`).

   **One manual step remains:** set `CRON_SECRET` in the environment and point a
   scheduler at the route. It **fails closed** — with no secret set it returns
   401 and sends nothing, because the response lists who is about to churn.

   ```
   # once CRON_SECRET is set, schedule it however you prefer, e.g.
   curl -H "Authorization: Bearer $CRON_SECRET" https://instarishta.me/api/cron/renewals
   ```

   pg_net is available (not yet enabled) if you would rather drive it from
   pg_cron than an external pinger.

Steps 1–2 are the only ones with real failure modes; 3–6 are UI over a schema
that is already proven.

## 8. What to verify

- Subscribe on the 31st → check cycle boundaries land 28/29 Feb then back to 31 Mar.
- Spend to 0, wait past a boundary, reload → balance is exactly the allowance, not allowance + 0.
- Sit out 3 cycles → one grant, not three.
- Hit `/api/account/profile` twice in a row across a boundary → second call does not re-grant.
- Buy a top-up, cross a reset → bonus credits survive, cycle credits reset.
- Let a term expire → plan reverts to `none`, bonus credits survive, `/pricing` CTA reappears.
- **Regression guard for the Part 0 bug**: sign up a brand-new Google account,
  confirm a row actually lands in `ir_user_profiles`, spend a credit, and check
  the balance really decreased in the database — not just in the UI.

---

## 11. The entitlement map — one definition, every surface

`entitlementsFor(planId)` in `src/lib/plans.ts` is now the single definition of
what a plan grants. Everything reads from it:

| Surface | Reads |
|---|---|
| `/pricing` compare table | generated from `entitlementsFor()` — no hand-written cells |
| `/account` usage bars | allowance per axis, plus `entitlements` on the profile API |
| `/nizam` user rows | granted-vs-used for every node, server-computed |
| `/nizam` "What each plan grants" | the catalog itself |
| `credits.ts` limiters | `audioLimitFor()` → `entitlementsFor().audioPerDay` |
| `/api/interests` | `interestAllowance()` |
| DB `ir_activate_plan` | mirrors `months` / `monthlyCredits` (asserted by test) |

Nodes covered: contact credits (cycle + top-up), interests (per month + daily
fair-use), audio plays, profile views, term, price, support tier, verified
badge, priority listing.

### The bug this exposed

`/pricing` sold **"Unlimited audio biodata"** to members and "Limited" to free
accounts. `credits.ts` gave **everyone 30/hour** — the feature was advertised on
one side and never enforced on the other. Audio is now per-day and plan-derived:
**free = 10/day, members = unlimited**.

> ⚠ This tightens the free tier in production. Free accounts previously had
> 30/hour (effectively unlimited for normal browsing) and now get 10/day. That
> is what `/pricing` has always claimed, and it makes audio a real reason to
> subscribe — but it is a live behavioural change, not just a refactor.

### Entitlements nothing enforces

`verifiedBadge` and `priorityListing` are flagged **manual** in the map and
labelled as such in `/nizam`. Profiles come from the external feed, which has no
badge or ranking field, so no code can honour them — they are promises the team
keeps by hand. They are marked rather than quietly implied so nobody mistakes
marketing copy for a working gate. Either keep doing them manually or drop them
from the cards.

### Verified

`ir_activate_plan` was exercised directly: free grants 10 welcome credits with
no refill, `ir6` grants 30 credits over 184 days, `ir12` grants 40 over 365, and
an unknown plan id raises. Those match `plans.ts` exactly, so the catalog and
the funding function cannot silently diverge.

---

## 10. Refunds — none

Business decision: **InstaRishta does not entertain refunds from anyone.** The
policy pages state this plainly rather than burying it, because a no-refund term
is only defensible if it was conspicuous before payment.

How it is framed, and why the framing matters:

- **The reason is stated, not just the rule.** The paid product is disclosure of
  private contact details belonging to real families — once revealed it cannot
  be un-seen or returned. That is a genuine, specific justification for
  non-refundability, and it reads very differently from a bare "no refunds."
- **The free tier is pushed hard.** Browsing, biodatas, audio and 10 welcome
  credits are free, and the policy repeatedly tells users to evaluate first and
  ask before paying. "You could have tried it free" is what makes a strict term
  reasonable rather than punitive.
- **No auto-renewal is emphasised.** Since nothing is ever auto-charged, there
  is no such thing as a surprise charge to dispute — which removes the most
  common trigger for refund demands and chargebacks entirely.
- **Forfeiture of unused monthly credits is disclosed up front** on `/pricing`,
  in the T&C and in the policy. Disclosed forfeiture is a pricing term; an
  undisclosed one is a complaint waiting to happen.

### The one carve-out — and why it protects you

`/refund-policy` §6 covers **money received where no membership was ever
activated**: a duplicated UPI transfer, a wrong amount, or a payment that never
got applied. That is deliberately *not* framed as a refund, because it isn't
one — it is returning money for something never sold.

Keeping this narrow carve-out is defensive, not a weakening. A policy that
refuses to return money even where nothing was ever delivered is the single
clause most likely to be struck down and to attract a chargeback or consumer
complaint — and it would undermine the credibility of the strict rule that
covers everything else. Every case where a membership *was* activated remains
absolutely non-refundable, however briefly or lightly it was used.

Remove it only if you have taken your own legal advice.

---

## 9. Phase 2 — Interests as a two-sided LEAD flow ✅ BUILT

Migrations `006_interests.sql` + `007_interest_leads.sql`, plus
`src/lib/interests.ts`, `src/lib/interest-chips.ts`,
`src/lib/hooks/useInterests.ts`, `/api/interests`, `/api/interests/reveal`,
`/api/admin/interests`, `InterestModal`, `MyInterests` on `/account`, and the
`/nizam` **Interests** queue.

### The flow

1. Member taps the heart and picks **one pre-made chip** — no typing. **Free**,
   no contact credit. Metered on a rolling 30-day allowance (5 free / 40 ir6 /
   60 ir12) with an unadvertised daily burst cap.
2. The lead lands in Telegram and in `/nizam → Interests`.
3. The team tells the advertiser and records the answer: **Told advertiser →
   Wants to connect / Declined**.
4. On *Wants to connect*, the lead turns actionable in the member's
   **My interests** on `/account`. Revealing the contact **spends one contact
   credit** — and only then.
5. `connected` is terminal. Re-revealing is free forever; admins cannot walk it
   back once the member has paid.

Declines and silence cost the member nothing.

### Three findings from the data that shaped this

**1. Profiles DO have a stable id — the app was throwing it away.** §9 of the
first draft said they had none. That was true of the app's `Profile` type but
false of the data: the upstream feed returns `id`, `phone`, `whatsapp`, `age`,
`education` and `priority`, and `_shared.ts` declared none of them. Verified
500/500 unique ids, none null, range 1767–2266. 007 re-keys interests from the
sha256 content hash onto `profile_id`, which is also more robust — an integer id
survives the advertiser editing their text, a content hash does not.

**2. There is no advertiser to notify directly.** Every one of the 500 profiles
carries the *same* phone and whatsapp: `+918886667121`, the business relay
number. The feed holds no per-advertiser contact, so "notify the advertiser"
is necessarily "notify the team, who relay offline". That is why the accept /
decline decision is recorded by an admin rather than by the advertiser.
If per-advertiser numbers ever enter the feed, `notifyLead()` in
`api/interests/route.ts` is the single place to change.

**3. Free text was removed on purpose.** A message box pointed at a stranger's
family is a permanent harassment and spam surface needing moderation forever.
`interest-chips.ts` is the entire vocabulary (bilingual EN/UR); only the `key`
is stored, so wording can change later without rewriting history. `note` is kept
nullable for pre-007 rows and is never written again.

### Rolling window, not the reset machinery

Contact credits use the cycle/reset columns from 005 because they are the money
unit. Interests use a rolling 30-day count over `ir_user_usage` — the mechanism
already proven for audio plays. No anchor columns, no month-boundary cliff, and
it works for free accounts, which have no plan anchor at all.

### Verified

12-step test on the live functions: send is free (credits untouched), duplicate
blocked by `profile_id`, reveal refused before acceptance *without charging*,
`responded_at` stamped, reveal charges exactly one credit, re-reveal charges
nothing, status becomes `connected`, admin cannot reverse a paid connection,
declined leads never charge, out-of-credits blocks reveal while leaving the lead
intact, and the T-14 feed includes/excludes correctly at 14 and 5 days.

The original evaluation follows, for the record.

### Why it earns a place on the pricing table

Interests are the one axis that does work contact credits cannot:

- **Anti-spray.** A finite, non-rolling monthly budget is the only real defence
  against one user sending interest to every profile on the platform — the
  failure mode that degrades every large matrimonial site.
- **Signal.** Scarcity makes each interest credible to the receiver. "She gets
  60 a month and spent one on you" carries weight a like never will.
- **Fits the reset shape.** Unlike contact credits, which people hoard,
  interests are naturally use-it-or-lose-it.

### Private action, not a public comment thread

The original idea was a comments section under channel posts. **Do not build
that.** These posts are real, identifiable people — frequently women, usually
posted by their families. A public comment thread under a woman's biodata is a
harassment vector and puts you squarely inside IT Rules 2021 intermediary
obligations (you already maintain a `/child-safety` page, so this is a live
concern, not a hypothetical).

Instead: an interest is a **one-tap private action** with an optional short
note, delivered to the family/admin. Same metering value, none of the exposure.
If you want social proof on the post, show a **count** — never identities.

### Proposed limits

| | Free | Rishta 6 | Rishta 12 |
|---|---|---|---|
| Contact credits | 10 one-time | 30 / month | 40 / month |
| **Interests** | 5 / month | **40 / month** | **60 / month** |
| Voice plays | 10 / day | Unlimited | Unlimited |
| Profile views | Unlimited | Unlimited | Unlimited |

Interests are *more* plentiful than contact credits because the funnel narrows
at each step: view → listen → interest → unlock. Anti-spam comes from an
**unadvertised fair-use daily sub-cap** (5–8/day) living in code like the
existing 30/hour audio rule — not from a small monthly number. Keep it out of
the pricing table and in the T&C.

### On the other two axes

- **Voice plays — do not meter harder.** Audio biodata is the *discovery*
  surface: it is how a family decides a profile is worth spending a credit on.
  Gating it suppresses unlocks, which are the actual revenue unit. And at 30/hr
  rolling it never binds (casual browsing is 5–10 plays), so three numbers on a
  pricing table would describe a limit nobody experiences. Make it binary:
  tight for free (10/day, actually felt), unlimited for members, with 30/hr
  retained purely as anti-abuse.
- **Profile view caps — do not build.** The old page advertised "Profile Views:
  up to 200/600/1,200" while `USAGE_LIMITS.view` was `unlimited` in code — a
  promise the app never kept. Browsing is what creates the desire to pay;
  capping it makes free users bounce before they find someone worth unlocking.
  Delete the row rather than implement it.

The reason to collapse four plans into two was fewer dimensions to compare.
Two metered rows plus two "unlimited for members" rows keeps that; four metered
rows would put the complexity straight back in as rows instead of columns.

### Build sketch

- `ir_interests` table — `(id, from_email, post_id, note, created_at)`, unique
  on `(from_email, post_id)` so re-sending does not double-spend.
- `interest` joins `USAGE_LIMITS` as a second `balance`-kind feature with its
  own cycle columns, reusing the `ir_sync_profile` reset machinery.
- Receiver-side inbox + a moderation queue in `/nizam` — this, not the metering,
  is the bulk of the work.
- Notification path can reuse the existing Telegram sender in
  `api/payment-notify/route.ts`.
