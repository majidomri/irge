/**
 * Sessions DAL — centralises every call related to ir_user_sessions so the
 * auth-aware logic lives in one place. Matches the Next.js docs + Bytegrad
 * recommendation: a Data Access Layer where every query that touches user
 * data passes through a consistent auth gate.
 *
 * Server-side mutations (the upsert with IP capture + the revoke flow) live
 * behind the /api/account/sessions/* routes that use withUser + service-role.
 * Client callers use the helpers here so they never construct the request
 * body or auth header inline.
 */

import { getAuthClient } from '@/lib/auth-client';
import { getSessionUid, computeFpHash } from '@/lib/iris';

export interface SessionRow {
  session_uid:  string;
  fp_hash:      string | null;
  ip:           string | null;
  user_agent:   string | null;
  country:      string | null;
  city:         string | null;
  created_at:   string;
  last_seen_at: string;
  revoked_at:   string | null;
}

export type RevokeScope = 'session' | 'others' | 'global';

/**
 * Log this browser as an active session for the signed-in user. The server
 * route reads cf-connecting-ip / cf-ipcountry / user-agent headers and
 * persists them — the client never knows its own IP.
 */
export async function logSession(accessToken: string): Promise<void> {
  if (!accessToken) return;
  try {
    const fpHash = await computeFpHash();
    await fetch('/api/account/sessions/log', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ session_uid: getSessionUid(), fp_hash: fpHash }),
    });
  } catch { /* swallow — session logging is best-effort */ }
}

/**
 * Fetch the calling user's sessions. The SECURITY DEFINER RPC filters by
 * auth.uid() so the result is always scoped to the caller; no client-side
 * filtering is required.
 */
export async function listSessions(): Promise<SessionRow[]> {
  const { data, error } = await getAuthClient().rpc('ir_user_sessions_list');
  if (error) throw error;
  return (data as SessionRow[]) ?? [];
}

/**
 * Revoke a session (this device, another device, all others, or global).
 * The server route uses the service-role key to call auth.admin.signOut so
 * the target's Supabase refresh token is actually invalidated at the server,
 * not just flagged in our DB.
 *
 * `scope: 'session'` — revoke one named session_uid
 * `scope: 'others'`  — revoke every session except `currentUid`
 * `scope: 'global'`  — revoke every session including the caller
 */
export async function revokeSession(opts: {
  accessToken: string;
  scope:       RevokeScope;
  target?:     string;
  currentUid?: string;
}): Promise<boolean> {
  const { accessToken, scope, target, currentUid } = opts;
  if (!accessToken) return false;

  const res = await fetch('/api/account/sessions/revoke', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      scope,
      session_uid: target,
      current_uid: currentUid,
    }),
  });
  return res.ok;
}
