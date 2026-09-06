/**
 * GET  /api/admin/moderation                    → dashboard: blocks, hidden, recent actions
 * GET  /api/admin/moderation?email=<addr>       → one person: what they did, and their state
 * POST /api/admin/moderation
 *        { action: 'block',   email, reason, hideListings?: boolean }
 *        { action: 'unblock', email, reason }
 *        { action: 'hide',    entityType, entityId, reason }
 *        { action: 'unhide',  entityType, entityId, reason }
 *
 * Admin-gated by withAdmin (better-auth session + ADMIN_EMAILS, service-role
 * DB). This is the "ban this account" shortcut that /api/admin/reports
 * documents as missing — it noted that wiring one needed a real account
 * resolver first. This is that resolver, and the answer turned out to be
 * email.
 *
 * Email is the only identifier the two halves of this system share.
 * ir_user_profiles is created by ir_sync_profile(p_email, ...) so its `id` is
 * its own uuid, unrelated to betterauth."user"."id"; betterauth keys sessions
 * off its own text id. Joining on uuid would have revoked the wrong person's
 * sessions, or nobody's. betterauth."user"."email" is unique, so it is the
 * one safe bridge.
 *
 * Nothing here deletes content. A block hides listings at most, and hiding is
 * a timestamp on a row that stays — the evidence has to survive the block that
 * the evidence justified. The one thing destroyed is sessions, because
 * "blocked" has to mean logged out now rather than at token expiry.
 */
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { withAdmin, type AdminDb } from '@/lib/admin-route';

const HIDEABLE = ['profile', 'member', 'post', 'story'] as const;
type Hideable = (typeof HIDEABLE)[number];

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.includes('@') && email.length <= 254 ? email : null;
}

/** betterauth user id for an email, or null when they have never signed in. */
async function authUserId(db: AdminDb, email: string): Promise<string | null> {
  const { data } = await db
    .schema('betterauth')
    .from('user')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

/**
 * Delete every session row for a user. better-auth reads sessions from this
 * table on each request, so removing them signs the person out everywhere at
 * once rather than on next expiry.
 */
async function revokeSessions(db: AdminDb, userId: string): Promise<number> {
  const { data, error } = await db
    .schema('betterauth')
    .from('session')
    .delete()
    .eq('userId', userId)
    .select('id');

  if (error) {
    console.error('[moderation] session revoke failed:', error.message);
    return 0;
  }
  return (data ?? []).length;
}

async function logAction(
  db: AdminDb,
  action: string,
  subjectType: string,
  subjectId: string,
  actor: string,
  reason: string | null,
  detail: Record<string, unknown> = {},
) {
  const { error } = await db.from('ir_moderation_actions').insert({
    action, subject_type: subjectType, subject_id: subjectId, actor, reason, detail,
  });
  if (error) console.error('[moderation] audit insert failed:', error.message);
}

// ── GET ──────────────────────────────────────────────────────────────────────

export const GET = withAdmin(async (req, { db }) => {
  const email = normaliseEmail(new URL(req.url).searchParams.get('email'));

  if (!email) {
    // Dashboard view.
    const [blocks, hidden, actions] = await Promise.all([
      db.from('ir_blocked_users')
        .select('subject_type, subject_id, email, display_name, reason, blocked_by, blocked_at, expires_at, unblocked_at')
        .is('unblocked_at', null)
        .order('blocked_at', { ascending: false })
        .limit(200),
      db.from('ir_hidden_listings')
        .select('entity_type, entity_id, reason, hidden_by, hidden_at')
        .is('unhidden_at', null)
        .order('hidden_at', { ascending: false })
        .limit(200),
      db.from('ir_moderation_actions')
        .select('action, subject_type, subject_id, reason, actor, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    return NextResponse.json({
      blocks:  blocks.data ?? [],
      hidden:  hidden.data ?? [],
      actions: actions.data ?? [],
    });
  }

  // One person: their account, their content, what has been reported about
  // them, and every moderation action taken — the trail an admin needs before
  // deciding anything.
  const userId = await authUserId(db, email);

  const [profile, sessions, reports, history, block] = await Promise.all([
    db.from('ir_user_profiles')
      .select('id, email, full_name, plan, contact_credits, is_banned, created_at')
      .eq('email', email)
      .maybeSingle(),
    userId
      ? db.schema('betterauth').from('session')
          .select('id, createdAt, expiresAt, ipAddress, userAgent')
          .eq('userId', userId)
          .order('createdAt', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    db.from('ir_reports')
      .select('id, entity_type, entity_id, category, description, severity, status, created_at')
      .eq('reporter_email', email)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('ir_moderation_actions')
      .select('action, reason, actor, detail, created_at')
      .eq('subject_type', 'member')
      .eq('subject_id', email)
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('ir_blocked_users')
      .select('reason, blocked_by, blocked_at, expires_at, unblocked_at, unblocked_by')
      .eq('subject_type', 'member')
      .eq('subject_id', email)
      .maybeSingle(),
  ]);

  const profileId = profile.data?.id as string | undefined;

  // Their own posts, so the admin can see and hide what they published.
  const posts = profileId
    ? await db.from('ir_posts')
        .select('id, title, caption, image, created_at')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] };

  return NextResponse.json({
    email,
    hasAccount: Boolean(userId),
    profile: profile.data ?? null,
    block: block.data ?? null,
    sessions: sessions.data ?? [],
    posts: posts.data ?? [],
    reportsBy: reports.data ?? [],
    history: history.data ?? [],
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

export const POST = withAdmin(async (_req, { db, body, email: actor }) => {
  const action = typeof body.action === 'string' ? body.action : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  if (!reason) {
    // Required on purpose: a block nobody can explain is one nobody dares
    // reverse, and this table is evidence.
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  if (action === 'block' || action === 'unblock') {
    const subject = normaliseEmail(body.email);
    if (!subject) return NextResponse.json({ error: 'valid email required' }, { status: 400 });

    if (action === 'unblock') {
      await db.from('ir_blocked_users')
        .update({ unblocked_at: new Date().toISOString(), unblocked_by: actor })
        .eq('subject_type', 'member')
        .eq('subject_id', subject);

      await db.from('ir_user_profiles').update({ is_banned: false }).eq('email', subject);
      await logAction(db, 'unblock', 'member', subject, actor, reason);

      revalidateTag('moderation', {});
      return NextResponse.json({ ok: true, action: 'unblock', email: subject });
    }

    const userId = await authUserId(db, subject);
    const revoked = userId ? await revokeSessions(db, userId) : 0;

    // is_banned is the flag the rest of the app already reads; ir_blocked_users
    // is the record of who did it and why.
    await db.from('ir_user_profiles').update({ is_banned: true }).eq('email', subject);

    const { error } = await db.from('ir_blocked_users').upsert({
      subject_type: 'member',
      subject_id:   subject,
      email:        subject,
      reason,
      blocked_by:   actor,
      blocked_at:   new Date().toISOString(),
      unblocked_at: null,
      unblocked_by: null,
    }, { onConflict: 'subject_type,subject_id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let hiddenCount = 0;

    if (body.hideListings === true) {
      const { data: profile } = await db.from('ir_user_profiles')
        .select('id').eq('email', subject).maybeSingle();

      const profileId = profile?.id as string | undefined;

      if (profileId) {
        const { data: posts } = await db.from('ir_posts')
          .select('id').eq('user_id', profileId).limit(500);

        const rows = (posts ?? []).map(p => ({
          entity_type: 'post',
          entity_id:   String(p.id),
          reason:      `Author blocked: ${reason}`,
          hidden_by:   actor,
        }));

        if (rows.length) {
          await db.from('ir_hidden_listings')
            .upsert(rows, { onConflict: 'entity_type,entity_id' });
          hiddenCount = rows.length;
        }
      }
    }

    await logAction(db, 'block', 'member', subject, actor, reason, {
      sessionsRevoked: revoked,
      listingsHidden:  hiddenCount,
      hadAccount:      Boolean(userId),
    });

    if (revoked > 0) {
      await logAction(db, 'revoke-sessions', 'member', subject, actor, reason, { count: revoked });
    }

    revalidateTag('moderation', {});

    return NextResponse.json({
      ok: true,
      action: 'block',
      email: subject,
      sessionsRevoked: revoked,
      listingsHidden: hiddenCount,
      // Surfaced so the UI can say so plainly rather than implying a logout
      // that never happened.
      note: userId ? undefined : 'No better-auth account for this email; nothing to sign out.',
    });
  }

  if (action === 'hide' || action === 'unhide') {
    const entityType = typeof body.entityType === 'string' ? body.entityType : '';
    const entityId   = typeof body.entityId === 'string' ? body.entityId.trim() : '';

    if (!HIDEABLE.includes(entityType as Hideable) || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId required' }, { status: 400 });
    }

    if (action === 'unhide') {
      await db.from('ir_hidden_listings')
        .update({ unhidden_at: new Date().toISOString(), unhidden_by: actor })
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);
    } else {
      await db.from('ir_hidden_listings').upsert({
        entity_type: entityType,
        entity_id:   entityId,
        reason,
        hidden_by:   actor,
        hidden_at:   new Date().toISOString(),
        unhidden_at: null,
        unhidden_by: null,
      }, { onConflict: 'entity_type,entity_id' });
    }

    await logAction(db, action, entityType, entityId, actor, reason);

    // Without this the listing keeps rendering for up to 30 minutes.
    revalidateTag('moderation', {});

    return NextResponse.json({ ok: true, action, entityType, entityId });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
});
