# Cron schedule (not yet enabled)

The four routes under `/api/cron` are written and working, but nothing
schedules them. `vercel.json` was added and then removed deliberately: these
run for real on the first firing, and two of them have consequences worth
seeing once by hand before they happen unattended.

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

## Restoring the schedule

Put this back at `instarishta-next/vercel.json` once the routes have been
exercised:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/renewals",        "schedule": "30 3 * * *" },
    { "path": "/api/cron/orders",          "schedule": "0 * * * *" },
    { "path": "/api/cron/cohort-counts",   "schedule": "0 2 * * *" },
    { "path": "/api/cron/profiles-refresh", "schedule": "0 */6 * * *" }
  ]
}
```

Check the plan first. Vercel Hobby allows two cron jobs at daily granularity;
the hourly `orders` entry and the four-job count both need Pro.
