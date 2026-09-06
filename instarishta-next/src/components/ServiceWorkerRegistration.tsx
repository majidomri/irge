'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Nothing registered one before: the previous /service-worker.js was a
 * kill-switch that only ever ran for visitors carrying a stale registration
 * from the old static site. A real worker needs a real registration.
 *
 * Deliberately after load. Registration competes with the page's own requests,
 * and the first visit is the one that must not be slowed down.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        // An unsupported context or a blocked registration is not worth
        // surfacing; the site works without it.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
