/**
 * better-auth catch-all handler.
 *
 * Routes:
 *   GET/POST /api/auth/sign-in/...
 *   GET/POST /api/auth/sign-up/...
 *   GET/POST /api/auth/sign-out
 *   GET/POST /api/auth/callback/...  (OAuth callback comes back here)
 *   GET      /api/auth/session
 *   POST     /api/auth/magic-link/...
 *   ... and every other better-auth-defined endpoint
 *
 * Node runtime — better-auth uses `pg` (Postgres) which requires Node, not Edge.
 */
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const runtime = 'nodejs';

export const { GET, POST } = toNextJsHandler(auth);
