/**
 * POST /api/csp-report → a browser's Content-Security-Policy violation report
 *
 * Always 204. Browsers send these fire-and-forget and never look at the
 * response, so an error status buys a failed request in someone's network
 * panel and nothing else.
 *
 * The policy ships as Content-Security-Policy-Report-Only first. Reports land
 * here, the real violations get folded into the policy, and only then does it
 * become enforcing — a CSP that blocks sign-in is worse than no CSP, and the
 * only way to know what a live site actually loads is to ask it.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_CONTENT = new NextResponse(null, { status: 204 });

/** Bigger than this is not one of ours. */
const MAX_BODY = 16 * 1024;

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return NO_CONTENT;

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Two shapes in the wild: the original {"csp-report": {...}} and the
    // Reporting API's array of {type, body}. Normalise both.
    const reports = Array.isArray(parsed)
      ? parsed.map(r => (r as { body?: unknown }).body ?? r)
      : [parsed['csp-report'] ?? parsed];

    for (const report of reports.slice(0, 10)) {
      const r = report as Record<string, unknown>;
      const directive = r['effective-directive'] ?? r['effectiveDirective'] ?? r['violated-directive'];
      const blocked   = r['blocked-uri'] ?? r['blockedURL'];
      const doc       = r['document-uri'] ?? r['documentURL'];

      // One line per violation so log search can group by directive.
      console.warn('[csp]', JSON.stringify({
        directive: String(directive ?? 'unknown').slice(0, 60),
        blocked:   String(blocked ?? '').slice(0, 200),
        document:  String(doc ?? '').slice(0, 200),
      }));
    }
  } catch {
    // Malformed body. Still 204 — see above.
  }

  return NO_CONTENT;
}
