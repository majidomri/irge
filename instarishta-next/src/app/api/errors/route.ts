/**
 * POST /api/errors  → receive a client-side error report
 *   204 always, whatever the body looked like
 *
 * Fired by the error boundaries when React has already given up on a subtree.
 *
 * Why this exists: server errors are logged by Next with a digest, and the
 * boundaries display that digest so a report can be tied to a log line. Client
 * errors had no such path. A render that threw inside a client component
 * showed the visitor "Something went wrong" and left no trace anywhere — the
 * one class of failure nobody could see, on a site whose heaviest routes are
 * client components.
 *
 * Same shape as /api/vitals deliberately: 204 always, a size cap, and one line
 * to the platform logs rather than a table. That is enough to answer "is this
 * happening, and where", without a migration and without storing anything tied
 * to a person. Give it a table when there is a reason to chart it.
 *
 * Deliberately NOT wired to window.onerror. Browser extensions and injected
 * third-party scripts throw constantly on pages they did not write, and a
 * global handler collects all of it. The boundaries fire only when our own
 * render failed, which is the signal worth having.
 *
 * No PII: a pathname, a message, a digest and a stack. Never a query string,
 * never listing content.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A report larger than this is not one of ours. */
const MAX_BODY_BYTES = 16 * 1024;

/** Enough of a stack to identify the frame; not so much that logs drown. */
const MAX_STACK_CHARS = 2000;

const NO_CONTENT = new NextResponse(null, { status: 204 });

function str(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, max) : undefined;
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return NO_CONTENT;

    const payload = JSON.parse(raw) as Record<string, unknown>;

    const message = str(payload.message, 500);
    if (!message) return NO_CONTENT;

    console.error(
      '[client-error]',
      JSON.stringify({
        message,
        // Present when the failure started on the server: the same digest the
        // boundary shows the visitor, so a screenshot ties to a server log.
        digest: str(payload.digest, 100),
        // 'global' means the root layout itself failed.
        boundary: str(payload.boundary, 20),
        path: str(payload.path, 200),
        stack: str(payload.stack, MAX_STACK_CHARS),
        ua: str(request.headers.get('user-agent'), 200),
      }),
    );
  } catch {
    // Malformed body. Still 204 — the sender is a page that is already broken
    // and has nothing useful to do with an error about its error report.
  }

  return NO_CONTENT;
}
