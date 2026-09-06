'use client';

import { useEffect } from 'react';

// Remix-style deferred resource: the calligraphic Urdu font is a visual
// upgrade, not LCP-critical. We inject the @font-face *after* the page is
// interactive so it can't drag the 234 KB woff2 onto the critical chain.
// Naskh is already loaded as the primary Urdu fallback; once Nastaliq
// finishes downloading, the browser swaps text in place automatically.
export default function LazyNastaliq() {
  useEffect(() => {
    // Defer until the browser is idle — never blocks anything.
    const idle =
      'requestIdleCallback' in window
        ? (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 200);

    idle(() => {
      // Avoid duplicate injection across client navigations.
      if (document.getElementById('lazy-nastaliq')) return;

      const link = document.createElement('link');
      link.id = 'lazy-nastaliq';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400..700&display=swap';
      document.head.appendChild(link);
    });
  }, []);

  return null;
}
