/**
 * Send one client error to /api/errors.
 *
 * Kept tiny on purpose: this ships to every route that has an error boundary,
 * and the whole point of the last several bundle passes was to stop shipping
 * things nobody needs.
 *
 * sendBeacon first — it survives the navigation that a visitor is very likely
 * to make immediately after seeing an error screen. fetch with keepalive is
 * the fallback for browsers that refuse a beacon (a Blob type they dislike,
 * or a Content-Security-Policy that blocks it).
 *
 * Never throws. A failure to report an error must not become a second error,
 * least of all inside an error boundary that is already the last thing
 * standing between the visitor and a blank page.
 */
export type ClientErrorReport = {
  message: string;
  digest?: string;
  /** 'route' for app/error.tsx, 'global' when the root layout itself failed. */
  boundary: 'route' | 'global';
  stack?: string;
};

export function reportClientError(report: ClientErrorReport): void {
  try {
    if (typeof window === 'undefined') return;

    const body = JSON.stringify({
      ...report,
      // Pathname only. A query string can carry a filter the visitor chose,
      // and that is their business, not the error log's.
      path: window.location.pathname,
    });

    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/errors', blob)) return;
    }

    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // See above: reporting is best effort, always.
  }
}
