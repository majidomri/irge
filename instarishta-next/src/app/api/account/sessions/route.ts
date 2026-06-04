/**
 * GET    /api/account/sessions  → list the signed-in user's active sessions
 * DELETE /api/account/sessions  → revoke all OTHER sessions (sign out everywhere else)
 *
 * Session tokens are deliberately NOT returned to the client (they're bearer
 * credentials). We expose only display metadata + a `current` flag, and offer a
 * single "sign out other devices" action via better-auth's revokeOtherSessions
 * — so no token ever needs to round-trip through client JS. Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessions = await auth.api.listSessions({ headers: req.headers });
  const currentToken = session.session?.token;

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id:        s.id,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current:   s.token === currentToken,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await auth.api.revokeOtherSessions({ headers: req.headers });
  return NextResponse.json({ ok: true });
}
