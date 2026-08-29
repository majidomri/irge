-- ════════════════════════════════════════════════════════════════════════════
-- 022_betterauth_phone_number.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Columns for better-auth's `phoneNumber` plugin (src/lib/auth.ts).
--
-- Phone sign-in is Firebase-verified: the browser runs the whole OTP round-trip
-- against Firebase Phone Auth and hands us a signed Firebase ID token, which the
-- server verifies before better-auth creates/loads the user. Nothing about that
-- needs extra storage — the plugin only wants these two columns on `user`.
--
-- Same conventions as 002: camelCase, QUOTED, because better-auth's Kysely
-- adapter emits double-quoted identifiers.
--
-- `phoneNumber` is UNIQUE (the plugin declares `unique: true` and looks users up
-- by it). It stays NULL for every email/Google user, and Postgres treats NULLs
-- as distinct, so a unique index is safe across an existing user base.
-- ════════════════════════════════════════════════════════════════════════════

alter table betterauth."user"
  add column if not exists "phoneNumber"         text,
  add column if not exists "phoneNumberVerified" boolean not null default false;

-- Partial unique index rather than a UNIQUE constraint: same guarantee for real
-- numbers, and explicit about NULLs being unconstrained.
create unique index if not exists "user_phoneNumber_key"
  on betterauth."user" ("phoneNumber")
  where "phoneNumber" is not null;
