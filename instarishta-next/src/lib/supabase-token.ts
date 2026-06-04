/**
 * Session fabric — mint a Supabase-compatible JWT from a better-auth session.
 *
 * better-auth users don't exist in Supabase Auth, so they normally can't use
 * Supabase RLS or Realtime. We bridge that by signing a short-lived HS256 JWT
 * with the project's *legacy* JWT secret (the same secret behind the eyJ...
 * service_role/anon keys). PostgREST + Realtime validate it natively — no
 * third-party-auth dashboard config needed — and `auth.uid()` resolves to the
 * `sub` we set (the user's ir_user_profiles.id).
 *
 * Requires env SUPABASE_JWT_SECRET (Dashboard → Settings → API → JWT Secret).
 * Returns null when unset so callers degrade gracefully to polling.
 */
import { createHmac } from 'node:crypto';

const SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

export const SUPABASE_BRIDGE_ENABLED = Boolean(SECRET);

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Sign a Supabase auth token. `sub` must be the user's ir_user_profiles.id
 * (uuid) so RLS policies of the form `auth.uid() = id` match. TTL default 1h.
 */
export function signSupabaseToken(
  params: { sub: string; email: string; ttlSeconds?: number },
): string | null {
  if (!SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.ttlSeconds ?? 3600);

  const header  = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub:   params.sub,
    email: params.email,
    role:  'authenticated',
    aud:   'authenticated',
    iat:   now,
    exp,
  };

  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig  = b64url(createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}
