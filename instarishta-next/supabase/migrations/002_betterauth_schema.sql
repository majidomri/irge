-- ════════════════════════════════════════════════════════════════════════════
-- 002_betterauth_schema.sql
-- ════════════════════════════════════════════════════════════════════════════
-- better-auth storage schema.
--
-- This was previously applied out-of-band (the auth.ts comment references a
-- migration "betterauth_schema_init" that was never committed). It is committed
-- here so the auth tables are reproducible on a fresh database.
--
-- These tables are read/written EXCLUSIVELY by better-auth through a direct
-- `pg` Pool (DATABASE_URL) using a connection whose search_path is
-- `betterauth,public` (see src/lib/auth.ts). They are NOT exposed through
-- PostgREST/Supabase REST — Supabase only exposes `public` + `graphql_public`,
-- so the `betterauth` schema is private by construction. Do NOT add it to the
-- API "Exposed schemas" list, and do NOT add RLS-via-anon access here.
--
-- Column names are camelCase and QUOTED on purpose: better-auth's Kysely
-- adapter emits double-quoted identifiers ("emailVerified", "expiresAt", …),
-- which Postgres treats case-sensitively. Unquoted columns would fold to
-- lowercase and never match the adapter's queries. Types mirror better-auth's
-- Postgres migrator: string→text, boolean→boolean, date→timestamptz, id→text.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists betterauth;

-- ── user ─────────────────────────────────────────────────────────────────────
create table if not exists betterauth."user" (
  "id"            text        primary key,
  "name"          text        not null,
  "email"         text        not null unique,
  "emailVerified" boolean     not null default false,
  "image"         text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

-- ── session ──────────────────────────────────────────────────────────────────
create table if not exists betterauth."session" (
  "id"        text        primary key,
  "expiresAt" timestamptz not null,
  "token"     text        not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text        not null references betterauth."user"("id") on delete cascade
);
create index if not exists "session_userId_idx" on betterauth."session" ("userId");

-- ── account (one row per credential: password + each OAuth provider link) ─────
create table if not exists betterauth."account" (
  "id"                    text        primary key,
  "accountId"             text        not null,
  "providerId"            text        not null,
  "userId"                text        not null references betterauth."user"("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null default now()
);
create index if not exists "account_userId_idx" on betterauth."account" ("userId");

-- ── verification (magic-link tokens, email-verification tokens) ───────────────
create table if not exists betterauth."verification" (
  "id"         text        primary key,
  "identifier" text        not null,
  "value"      text        not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now()
);
create index if not exists "verification_identifier_idx" on betterauth."verification" ("identifier");

-- ── auth audit log (xavio "security_audit_log" parallel, app-layer) ───────────
-- Written best-effort by databaseHooks in src/lib/auth.ts on sign-in / sign-up /
-- session create. Never blocks an auth operation. Lives in `betterauth` so it is
-- also private to the direct pg connection (not exposed via PostgREST).
create table if not exists betterauth."auth_audit" (
  id          bigint generated always as identity primary key,
  event       text        not null,          -- e.g. user.created, session.created
  user_id     text,                          -- betterauth.user.id (no FK: keep audit rows after user deletion)
  email       text,
  provider    text,                          -- google | credential | magic-link | ...
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists "auth_audit_user_id_idx"    on betterauth."auth_audit" (user_id);
create index if not exists "auth_audit_created_at_idx"  on betterauth."auth_audit" (created_at desc);
