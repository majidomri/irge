-- ════════════════════════════════════════════════════════════════════════════
-- 004_betterauth_ratelimit.sql
-- ════════════════════════════════════════════════════════════════════════════
-- DB-backed rate-limit store for better-auth. In-memory rate limiting is
-- per-serverless-instance (useless on Vercel, where each cold start is isolated);
-- a shared table makes the limits actually hold across instances.
--
-- Column shape matches better-auth's rateLimit model (key unique, count int,
-- "lastRequest" bigint epoch-ms). Private to the betterauth schema like the rest.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists betterauth."rateLimit" (
  "id"          text   primary key,
  "key"         text   not null unique,
  "count"       integer not null,
  "lastRequest" bigint  not null
);
