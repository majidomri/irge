'use client';

import { useEffect } from 'react';

/**
 * The last error boundary.
 *
 * app/error.tsx sits *inside* the root layout, so it cannot catch an error
 * thrown by the root layout itself — a failure in the fonts, the metadata, or
 * any of the components mounted beside {children} took the whole page to a
 * blank screen with nothing to recover from. global-error replaces the root
 * layout entirely when that happens, which is why it has to render its own
 * <html> and <body>.
 *
 * It ships to every route and runs when the app is already broken, so it uses
 * inline styles and pulls in nothing of ours: any shared module it depended on
 * could be the thing that failed. The one import is useEffect, which is React
 * itself — already running, or this component would not be rendering.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Inlined rather than importing lib/report-error, for the same reason the
  // rest of this file has no imports: the root layout has already failed, and
  // a shared module could be what failed. useEffect is React itself, which is
  // running regardless — this component is rendering.
  useEffect(() => {
    try {
      const body = JSON.stringify({
        message: error.message,
        digest: error.digest,
        boundary: 'global',
        stack: error.stack,
        path: window.location.pathname,
      });
      const blob = new Blob([body], { type: 'application/json' });
      if (!navigator.sendBeacon?.('/api/errors', blob)) {
        void fetch('/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Reporting must never be the second failure on this screen.
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#FAFAF9',
          color: '#141413',
          fontFamily: 'system-ui, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <main
          style={{
            width: '100%',
            maxWidth: '30rem',
            padding: '40px 32px',
            textAlign: 'center',
            border: '1px solid #E8E4E0',
            borderRadius: 18,
            background: '#fff',
          }}
        >
          <h1 style={{ margin: '0 0 10px', fontSize: '1.5rem', lineHeight: 1.25 }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 8px', color: '#4B4B4B', lineHeight: 1.6 }}>
            InstaRishta hit an error it could not recover from on this page.
          </p>

          <div style={{ marginTop: 26, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: 'none',
                padding: '11px 22px',
                borderRadius: 999,
                border: 'none',
                background: '#006241',
                color: '#fff',
                font: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                This renders when the root layout has failed. next/link needs
                the router that may be the thing that broke; a plain anchor
                does a full document load, which is the recovery we want. */}
            <a
              href="/"
              style={{
                display: 'inline-block',
                padding: '11px 22px',
                borderRadius: 999,
                border: '1px solid #D1CDC7',
                color: '#141413',
                font: 'inherit',
                textDecoration: 'none',
              }}
            >
              Go to home
            </a>
          </div>

          {/* The digest is what ties this to a line in the server logs. */}
          {error.digest && (
            <p style={{ marginTop: 18, fontSize: '0.75rem', color: '#767676' }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
