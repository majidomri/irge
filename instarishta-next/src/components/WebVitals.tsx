'use client';

import { useEffect } from 'react';

/**
 * Field measurement for Core Web Vitals, with attribution.
 *
 * The other half of the INP work: src/lib/scheduling.ts made interactions
 * cheaper, but nothing here told us whether that helped real visitors on real
 * phones. A lab profile is one device on one network; INP is a 75th percentile
 * across all of them, and the interactions that actually hurt are rarely the
 * ones you would think to profile.
 *
 * The attribution build is what makes a report actionable. A bare "INP: 412ms"
 * says nothing; attribution splits it into input delay, processing duration and
 * presentation delay, and names the element and the longest script — which is
 * the difference between knowing the page is slow and knowing which handler to
 * fix.
 *
 * Loaded dynamically after the page settles, so the library is never on the
 * critical path of the thing it is measuring.
 */

/** Reports are dropped rather than queued past this, to bound memory. */
const MAX_QUEUED = 20;

/**
 * A stable name for the element that was interacted with.
 *
 * web-vitals defaults to a CSS selector, which is close to useless in field
 * data here: Tailwind and the Next build both produce class names that change
 * between deploys, so the same button aggregates under a different key every
 * release. This prefers identifiers that survive a rebuild.
 */
function describeTarget(el: Node | null): string | undefined {
  if (!(el instanceof Element)) return undefined;

  const labelled = el.closest<HTMLElement>('[data-vitals]');
  if (labelled?.dataset.vitals) return labelled.dataset.vitals;

  const parts: string[] = [el.tagName.toLowerCase()];

  const role = el.getAttribute('role');
  if (role) parts.push(`role=${role}`);

  // aria-label is authored text, not generated, so it is stable across builds.
  const label = el.getAttribute('aria-label');
  if (label) parts.push(`label=${label.slice(0, 40)}`);

  if (el.id) parts.push(`#${el.id}`);

  return parts.join('|');
}

type Report = Record<string, unknown>;

export function WebVitals() {
  useEffect(() => {
    // Requires PerformanceObserver; older browsers simply do not report.
    if (typeof PerformanceObserver === 'undefined') return;

    const queue: Report[] = [];
    let flushed = false;

    const flush = () => {
      if (flushed || queue.length === 0) return;
      flushed = true;

      const body = JSON.stringify({
        url: location.pathname,
        metrics: queue.splice(0, queue.length),
      });

      // sendBeacon survives the page going away, which is the only reliable
      // moment to report a metric that is not final until then.
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/vitals', { body, method: 'POST', keepalive: true }).catch(() => {});
      }
    };

    const enqueue = (report: Report) => {
      if (queue.length >= MAX_QUEUED) return;
      queue.push(report);
    };

    let cancelled = false;

    const start = async () => {
      try {
        const { onINP, onLCP, onCLS } = await import('web-vitals/attribution');
        if (cancelled) return;

        onINP(
          ({ value, rating, attribution }) => {
            enqueue({
              name: 'INP',
              value: Math.round(value),
              rating,
              target: attribution.interactionTarget,
              type: attribution.interactionType,
              // The three phases. Whichever dominates is the one to fix, and
              // they call for completely different work: a blocked main thread,
              // an expensive listener, or a slow render.
              inputDelay: Math.round(attribution.inputDelay),
              processingDuration: Math.round(attribution.processingDuration),
              presentationDelay: Math.round(attribution.presentationDelay),
              loadState: attribution.loadState,
              // Long Animation Frames name the actual culprit: which script,
              // in which file, and how much of it was forced layout.
              script: attribution.longestScript && {
                subpart: attribution.longestScript.subpart,
                duration: Math.round(attribution.longestScript.intersectingDuration),
                source: attribution.longestScript.entry.sourceURL || undefined,
                fn: attribution.longestScript.entry.sourceFunctionName || undefined,
                forcedLayout: Math.round(
                  attribution.longestScript.entry.forcedStyleAndLayoutDuration ?? 0,
                ),
              },
            });
          },
          { generateTarget: describeTarget },
        );

        onLCP(({ value, rating, attribution }) => {
          enqueue({
            name: 'LCP',
            value: Math.round(value),
            rating,
            target: attribution.target,
            ttfb: Math.round(attribution.timeToFirstByte),
            resourceLoadDelay: Math.round(attribution.resourceLoadDelay),
            resourceLoadDuration: Math.round(attribution.resourceLoadDuration),
            elementRenderDelay: Math.round(attribution.elementRenderDelay),
          });
        });

        onCLS(({ value, rating, attribution }) => {
          enqueue({
            name: 'CLS',
            value: Math.round(value * 1000) / 1000,
            rating,
            target: attribution.largestShiftTarget,
            loadState: attribution.loadState,
          });
        });
      } catch {
        // Measurement must never break the page it is measuring.
      }
    };

    /**
     * visibilitychange, not unload: it is the only lifecycle event that fires
     * reliably on mobile, where a backgrounded tab may be discarded without
     * ever firing unload or pagehide's final call.
     */
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    addEventListener('visibilitychange', onHidden);
    addEventListener('pagehide', flush);

    /**
     * Never on the critical path. `requestIdleCallback` is typed as always
     * present but is not, so the capability is tested with `typeof` rather
     * than truthiness — the same shape GoogleOneTap uses.
     */
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const hasIdle = typeof w.requestIdleCallback === 'function';
    const idle = hasIdle
      ? w.requestIdleCallback!(() => void start(), { timeout: 5000 })
      : window.setTimeout(start, 3000);

    return () => {
      cancelled = true;
      removeEventListener('visibilitychange', onHidden);
      removeEventListener('pagehide', flush);

      // Cancel with the same mechanism that scheduled it.
      if (hasIdle) w.cancelIdleCallback?.(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return null;
}
