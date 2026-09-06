/**
 * Environment configuration, validated once.
 *
 * From bulletproof-react's "validate environment variables at startup" rule.
 * The pattern here was `process.env.SUPABASE_SERVICE_ROLE_KEY!` — 26 non-null
 * assertions across the codebase, each of which turns a missing variable into
 * `undefined` handed to a client constructor, and then into an opaque failure
 * deep inside a request that has nothing to do with configuration.
 *
 * `serverEnv()` fails loudly instead, naming what is missing. It is a function
 * rather than a module-level constant on purpose: evaluating at import time
 * would run during the build's module graph construction, where a variable
 * that is only present at runtime would fail a build that would have worked.
 *
 * Server-only. Nothing here may be imported into a client component —
 * SUPABASE_SERVICE_ROLE_KEY bypasses row-level security and must never reach a
 * browser bundle. NEXT_PUBLIC_ values are safe to read directly where needed.
 */

type ServerEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !supabaseServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
        'Set them in .env.local for development, or in the Vercel project settings for a deploy.',
    );
  }

  cached = {
    supabaseUrl: supabaseUrl as string,
    supabaseServiceRoleKey: supabaseServiceRoleKey as string,
  };
  return cached;
}
