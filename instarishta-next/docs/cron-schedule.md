# Cron schedule

All four routes under `/api/cron` are scheduled in `vercel.json`, once per day
each. They were tested by hand first — see below for what each one does and
what "tested" actually proved.

## Plan

Cron jobs are included in every Vercel plan, Hobby included; there is nothing
premium about them. The one Hobby restriction is frequency: **once per day per
job**, and anything more frequent *fails at deployment* with "Hobby accounts
are limited to daily cron jobs". Timing is also only accurate to the hour on
Hobby, so `0 5 * * *` fires somewhere between 05:00 and 05:59 UTC.

Every schedule here is daily, so it deploys on any plan. If you move to Pro
and want `orders` hourly again, `0 * * * *` becomes legal — but read the note
about its untested branch first.

## What each one does when it runs

| Route | Effect | Risk if it fires unwatched |
|---|---|---|
| `profiles-refresh` | Busts the CDN, repopulates the worker KV, purges the Next tag | None. Idempotent; a failed fetch leaves the previous payload |
| `cohort-counts` | Recomputes published cohort counts from `ir_user_profiles` | None. Idempotent reconciler |
| `renewals` | Sends an **admin** Telegram digest of members expiring in N days | Low. An unexpected Telegram message; no member is contacted |
| `orders` | Releases unpaid order suffixes and **revokes credits** from claims no admin confirmed inside the grace window | Real. Credits are taken back. Run by hand first and read the output |

Neither `renewals` nor `orders` supports a dry run — every invocation is a
real one.

## Testing one by hand

Both accept `Authorization: Bearer $CRON_SECRET` or `?secret=`. Start with the
two harmless ones:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://www.instarishta.me/api/cron/profiles-refresh

curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://www.instarishta.me/api/cron/cohort-counts
```

`orders` takes a grace window in hours. A large value makes it a near no-op,
which is the safe way to see what it *would* do before letting it act:

```bash
# Nothing older than 720h is unconfirmed, so this should revoke 0.
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.instarishta.me/api/cron/orders?grace=720"
```

## Current schedule

| UTC | Route |
|---|---|
| 02:00 | `cohort-counts` |
| 03:30 | `renewals` |
| 05:00 | `orders` |
| 06:00 | `profiles-refresh` |

Spread across the morning rather than stacked on one minute, so a slow run
never overlaps the next job. On Hobby each fires within the hour that follows.

## What the hand-tests actually proved

All four returned 200 against production, which confirms auth via
`CRON_SECRET`, database access and response shape.

`profiles-refresh` and `cohort-counts` did real work and are fully exercised —
500 profiles refreshed, and cohort counts reconciled (they wrote zeros, which
is the truth: no profile carries a `profession_key` yet).

`orders` and `renewals` returned `revoked: 0` and `expiring: 0` because there
was nothing for them to act on. Their consequential branches — revoking
credits, composing the Telegram digest — have still never executed. Both fail
safe on empty input, which is what a first scheduled run will meet, but the
first time either does something real is worth watching.
