/**
 * POST /api/account/sessions/revoke
 *
 * Revokes user sessions. Three scopes:
 *   - 'session': revoke a single named session_uid (this row + scope=local on the
 *     calling client if it matches; remote rows: call auth.admin.signOut(user)
 *     scope='others' to kill other refresh tokens, then mark our row revoked)
 *   - 'others':  revoke every session except the caller's current session_uid
 *   - 'global':  revoke every session including the caller (auth.admin.signOut)
 *
 * Auth: bearer token of the user themselves. No admin role required — users can
 * only revoke their OWN sessions.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withUser } from '@/lib/typed-route';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type Scope = 'session' | 'others' | 'global';

export const POST = withUser(async (_req, { userId, token, body }) => {
  const scope        = body.scope        as Scope | undefined;
  const targetUid    = body.session_uid  as string | undefined;
  const currentUid   = body.current_uid  as string | undefined;

  if (!scope || !['session', 'others', 'global'].includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  }

  const admin = serviceClient();

  if (scope === 'global') {
    const { error } = await admin.auth.admin.signOut(userId, 'global');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from('ir_user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    return NextResponse.json({ ok: true, scope });
  }

  if (scope === 'others') {
    if (!currentUid) return NextResponse.json({ error: 'current_uid required' }, { status: 400 });
    const { error } = await admin.auth.admin.signOut(userId, 'others');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Mark every row except the one we're keeping as revoked.
    await admin.from('ir_user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .neq('session_uid', currentUid)
      .is('revoked_at', null);
    return NextResponse.json({ ok: true, scope });
  }

  // scope === 'session'
  if (!targetUid) return NextResponse.json({ error: 'session_uid required' }, { status: 400 });

  // If the caller is revoking their OWN current session, just do a server-side
  // global signout for that single refresh token. Supabase JS doesn't expose
  // per-session admin revoke, so the closest analogue is 'others' (when target
  // is a remote one) — we approximate by marking the row revoked and relying on
  // the access-token max age (1 h) to kick in. For the caller's current row we
  // ask the client to also signOut({ scope: 'local' }).
  if (targetUid === currentUid) {
    // Caller signing themselves out from THIS device: client handles local
    // signOut; we just mark the row revoked for the audit trail.
    await admin.from('ir_user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_uid', targetUid);
    return NextResponse.json({ ok: true, scope, target: targetUid, local: true });
  }

  // Revoking a REMOTE session. Best-effort: kill all other refresh tokens
  // (Supabase admin API doesn't let us target one specific session by id from
  // JS, only 'global'|'local'|'others'). 'others' from the caller's POV will
  // kill the target plus any other concurrent ones.
  const { error } = await admin.auth.admin.signOut(userId, 'others');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from('ir_user_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .neq('session_uid', currentUid ?? '')
    .is('revoked_at', null);

  // token unused but referenced to make linter happy: token is the caller's
  // access token, already validated by withUser.
  void token;

  return NextResponse.json({ ok: true, scope, target: targetUid });
});
