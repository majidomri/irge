/**
 * Reports — misuse/abuse reporting, shared between the public submission
 * route (/api/reports) and the admin queue (/api/admin/reports).
 *
 * See supabase/migrations/009_reports.sql. RLS denies all direct client
 * access; every read/write goes through a service-role route, same pattern
 * as ir_interests.
 */
// Nothing in this module may reach the browser: it holds the Resend SDK and
// the service-role client. The shared vocabulary lives in ./report-categories
// and is re-exported below, so a client component imports that instead.
import 'server-only';

import { Resend } from 'resend';
import { serviceClient } from './credits';
import { categoryLabel, REPORT_CATEGORIES, severityFor } from './report-categories';
import type { ReportCategory, ReportEntityType, ReportSeverity, ReportStatus } from './report-categories';

export type {
  ReportEntityType,
  ReportCategory,
  ReportStatus,
  ReportSeverity,
} from './report-categories';
export {
  ENTITY_TYPES,
  REPORT_CATEGORIES,
  isEntityType,
  isReportCategory,
  categoryLabel,
  severityFor,
} from './report-categories';

const MAX_REPORTS_PER_WINDOW = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Best-effort spam brake so the report button can't be weaponised against a
 * rival's listing: at most 5 reports per 24h from the same signed-in user, or
 * (when signed out) the same contact email or IP — whichever identity signal
 * is actually available. Returns false (never blocks) when none is.
 */
export async function isRateLimited(identity: {
  userId?: string | null; email?: string | null; ip?: string | null;
}): Promise<boolean> {
  const db = serviceClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  let query = db.from('ir_reports').select('id', { count: 'exact', head: true }).gte('created_at', since);

  if (identity.userId)      query = query.eq('reporter_user_id', identity.userId);
  else if (identity.email)  query = query.eq('reporter_email', identity.email);
  else if (identity.ip)     query = query.eq('ip_address', identity.ip);
  else return false;

  const { count } = await query;
  return (count ?? 0) >= MAX_REPORTS_PER_WINDOW;
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SAFETY_EMAIL = process.env.SAFETY_EMAIL ?? 'safety@instarishta.me';

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Best-effort alert. NEVER throws into the submission flow — the report is
 * already durably recorded by the time this runs, and a Telegram/email
 * outage must not lose it or fail the caller's request.
 */
export async function notifyReport(r: {
  id: string;
  entityType: ReportEntityType;
  entityId: string | null;
  profileNum: number | null;
  category: ReportCategory;
  severity: ReportSeverity;
  description: string | null;
  reporterEmail: string | null;
}): Promise<void> {
  const label  = categoryLabel(r.category);
  const urgent = r.severity === 'urgent';
  const target1Line = `${r.entityType}${r.profileNum ? ` · IR #${r.profileNum}` : ''}${r.entityId ? ` · ${r.entityId}` : ''}`;

  const token  = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const target = process.env.TELEGRAM_TARGET?.trim();
  if (token && target) {
    const lines = [
      urgent ? `<b>🚨 URGENT REPORT — ${esc(label)}</b>` : `<b>🚩 New report — ${esc(label)}</b>`,
      ``,
      `<b>Target:</b> ${esc(target1Line)}`,
      r.description ? `<b>Details:</b> ${esc(r.description).slice(0, 500)}` : '',
      `<b>Reporter:</b> ${esc(r.reporterEmail ?? 'anonymous')}`,
      urgent ? `` : '',
      urgent ? `<b>Action required within 2 hours — see Child Safety Policy.</b>` : '',
      ``,
      `Review in /nizam → Reports.`,
      `<b>Time:</b> ${new Date().toISOString()}`,
    ].filter(Boolean);

    const payload: Record<string, unknown> = {
      chat_id: target, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true,
    };
    const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID?.trim();
    if (threadId) payload.message_thread_id = threadId;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).catch(() => {});
  }

  if (urgent && resend) {
    await resend.emails.send({
      from:    process.env.RESEND_FROM ?? 'InstaRishta <auth@instarishta.me>',
      to:      SAFETY_EMAIL,
      subject: `🚨 Urgent report — ${label} (#${r.id.slice(0, 8)})`,
      html: `
        <p><strong>${esc(label)}</strong></p>
        <p><strong>Target:</strong> ${esc(target1Line)}</p>
        <p>${esc(r.description ?? 'No description provided.')}</p>
        <p><strong>Reporter:</strong> ${esc(r.reporterEmail ?? 'anonymous')}</p>
        <p>Review in /nizam → Reports.</p>
      `,
    }).catch(() => {});
  }
}
