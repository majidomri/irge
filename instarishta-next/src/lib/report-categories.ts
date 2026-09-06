/**
 * Report vocabulary — the part both the browser and the server need.
 *
 * This was inside lib/reports.ts, which also imports the Resend SDK and the
 * service-role Supabase client. Two client components (the /report form and
 * ReportModal) import nothing from that file but this list of labels, and a
 * client import pulls the whole module graph: Resend and its svix dependency
 * were being bundled into the browser — 244 KB of email-sending code shipped
 * to render eight <option> elements.
 *
 * So the shared vocabulary lives here, with no imports at all, and the
 * server-only machinery stays next door. lib/reports.ts re-exports all of it,
 * so server callers are unaffected.
 */
export type ReportEntityType = 'profile' | 'member' | 'post' | 'story' | 'channel' | 'other';
export type ReportCategory =
  | 'fake_profile' | 'underage' | 'harassment' | 'scam_fraud'
  | 'inappropriate_content' | 'impersonation' | 'spam' | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type ReportSeverity = 'normal' | 'urgent';

export const ENTITY_TYPES: ReportEntityType[] = ['profile', 'member', 'post', 'story', 'channel', 'other'];

/**
 * `urgent: true` categories page the safety team the moment a report lands
 * (Telegram + email) instead of waiting for someone to open /nizam — this is
 * what actually backs the "reviewed within 2 hours" promise on /child-safety
 * for suspected-minor reports.
 */
export const REPORT_CATEGORIES: { key: ReportCategory; label: string; urgent?: boolean }[] = [
  { key: 'underage',              label: 'Suspected minor / underage', urgent: true },
  { key: 'fake_profile',          label: 'Fake or impersonated profile' },
  { key: 'scam_fraud',            label: 'Scam, fraud, or money request' },
  { key: 'harassment',            label: 'Harassment or abusive behaviour' },
  { key: 'inappropriate_content', label: 'Inappropriate photo, video, or text' },
  { key: 'impersonation',         label: 'Impersonating someone else' },
  { key: 'spam',                  label: 'Spam or repeated messages' },
  { key: 'other',                 label: 'Something else' },
];

export function isEntityType(v: unknown): v is ReportEntityType {
  return typeof v === 'string' && (ENTITY_TYPES as string[]).includes(v);
}

export function isReportCategory(v: unknown): v is ReportCategory {
  return typeof v === 'string' && REPORT_CATEGORIES.some(c => c.key === v);
}

export function categoryLabel(key: string): string {
  return REPORT_CATEGORIES.find(c => c.key === key)?.label ?? key;
}

export function severityFor(category: ReportCategory): ReportSeverity {
  return REPORT_CATEGORIES.find(c => c.key === category)?.urgent ? 'urgent' : 'normal';
}
