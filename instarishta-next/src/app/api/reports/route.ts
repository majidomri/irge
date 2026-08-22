/**
 * POST /api/reports — submit a misuse/abuse report.
 *   body: { entityType?, entityId?, profileNum?, category, description?, contactEmail? }
 *   201 → { ok:true, reportId }
 *   400 → validation error
 *   429 → rate-limited (see lib/reports.ts)
 *
 * Open to everyone, signed in or not — /child-safety already promises "any
 * user can report ... with one click" and a 2-hour review SLA. This route is
 * what actually backs that promise; previously the only channel was
 * mailto:/WhatsApp with nothing in the app itself. A session is read for
 * attribution when present, but is never required — forcing a signup to
 * report abuse suppresses exactly the reports that matter most.
 *
 * GET /api/reports — the signed-in caller's own reports (status only, no
 * admin-only fields). Empty list when signed out.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient, ensureProfile } from '@/lib/credits';
import {
  isEntityType, isReportCategory, severityFor, isRateLimited, notifyReport,
} from '@/lib/reports';

export const runtime = 'nodejs';

/** Trust the same proxy headers better-auth trusts for its own IP reads. */
function clientIp(req: NextRequest): string | null {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (!isReportCategory(body.category)) {
    return NextResponse.json({ error: 'Please choose a report category' }, { status: 400 });
  }
  const category   = body.category;
  const entityType = isEntityType(body.entityType) ? body.entityType : 'other';
  const entityId    = typeof body.entityId === 'string' && body.entityId.trim() ? body.entityId.trim().slice(0, 200) : null;
  const profileNum  = typeof body.profileNum === 'number' && Number.isFinite(body.profileNum) ? Math.trunc(body.profileNum) : null;
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null;
  const contactRaw   = typeof body.contactEmail === 'string' ? body.contactEmail.trim().slice(0, 200) || null : null;

  const reporterEmail = session?.user?.email ?? null;
  const ip = clientIp(req);
  const db = serviceClient();

  // session.user.id is better-auth's own id — NOT the auth.users uuid that
  // reporter_user_id's foreign key points to (see /api/auth/supabase-token).
  // ensureProfile resolves the real bridge: ir_user_profiles.id, which IS
  // auth.users.id. Only called when signed in, so filing a report while
  // signed out never creates a profile row.
  const reporterId = reporterEmail
    ? (await ensureProfile(db, reporterEmail, session?.user?.name || null)).id // || not ?? — better-auth defaults name to '', not null
    : null;

  if (await isRateLimited({ userId: reporterId, email: reporterEmail ?? contactRaw, ip })) {
    return NextResponse.json(
      { error: 'You have submitted several reports recently. Our team is reviewing them — please wait before sending more.' },
      { status: 429 },
    );
  }

  const severity = severityFor(category);
  const { data, error } = await db
    .from('ir_reports')
    .insert({
      reporter_user_id: reporterId,
      reporter_email:   reporterEmail,
      reporter_contact: contactRaw,
      entity_type: entityType,
      entity_id:   entityId,
      profile_num: profileNum,
      category, description, severity,
      ip_address: ip,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[reports] insert failed:', error?.message);
    return NextResponse.json({ error: 'Could not submit your report. Please try again.' }, { status: 500 });
  }

  // Best-effort: the report is already durably recorded, so an alert outage
  // must not lose it or fail the caller's request.
  void notifyReport({
    id: data.id, entityType, entityId, profileNum, category, severity, description,
    reporterEmail: reporterEmail ?? contactRaw,
  }).catch(() => {});

  return NextResponse.json({ ok: true, reportId: data.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) return NextResponse.json({ reports: [] });

  const db = serviceClient();
  const profile = await ensureProfile(db, session.user.email, session.user.name || null); // || not ?? — better-auth defaults name to '', not null
  const { data } = await db
    .from('ir_reports')
    .select('id, entity_type, profile_num, category, status, created_at')
    .eq('reporter_user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ reports: data ?? [] });
}
