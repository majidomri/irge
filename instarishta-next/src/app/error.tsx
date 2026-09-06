'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { reportClientError } from '@/lib/report-error';

/**
 * The route-level error boundary.
 *
 * It used to render its own <html> and <body>. That is global-error.tsx's
 * contract — global-error replaces the root layout, so it must supply the
 * document shell. This file does not: per Next's own docs, error.js "wraps
 * loading.js, not-found.js, page.js, and nested layout.js files" and sits
 * inside the root layout, which has already opened <html> and <body>. So the
 * old version nested a second document inside the first one whenever it
 * caught anything.
 *
 * It was also still called GlobalError, which is the tell: this was written
 * as the global handler before a real global-error.tsx existed beside it, and
 * never updated afterwards.
 *
 * Unlike global-error, this one runs while the app is still standing, so it
 * can use next/link and the site's own styling.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report once per error. Without this a client-side render failure showed
  // the visitor this screen and left no trace anywhere — the digest below is
  // only present when the throw started on the server.
  useEffect(() => {
    reportClientError({
      message: error.message,
      digest: error.digest,
      boundary: 'route',
      stack: error.stack,
    });
  }, [error]);

  return (
    <div
      className="flex flex-col items-center justify-center px-4 text-center"
      style={{ minHeight: '60vh', background: '#FAFAF9' }}
    >
      <div className="text-5xl mb-4">😕</div>
      <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
      <p className="text-sm mb-6 max-w-xs" style={{ color: '#696969' }}>
        This page hit an error. The rest of InstaRishta is still working.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-6 py-2.5 text-sm font-bold"
          style={{ background: '#006241', color: '#fff' }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full px-6 py-2.5 text-sm font-bold"
          style={{ border: '1px solid #D1CDC7', color: '#141413' }}
        >
          Go to home
        </Link>
      </div>

      {/* The digest is what ties this to a line in the server logs. */}
      {error.digest && (
        <p className="mt-5 text-xs" style={{ color: '#767676' }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
