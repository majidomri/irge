'use client';
import { useEffect, useState } from 'react';

/**
 * Hide the site chrome (top bar, bottom dock) while the reader scrolls down a
 * long list of ads, bring it back the moment they scroll up.
 *
 * One listener serves every consumer via a module-level subscriber set — the
 * dock and both navbars mount at once, and three independent scroll listeners
 * on the same page is wasted work on exactly the low-end phones this is meant
 * to feel smooth on.
 */

type Listener = (hidden: boolean) => void;

const listeners = new Set<Listener>();
let hidden = false;
let started = false;

/** Ignore the rubber-band overscroll at the very top of the page. */
const TOP_ZONE = 80;
/** Movement below this is jitter, not intent — a fixed dock must not flicker. */
const THRESHOLD = 8;

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;

  let lastY = window.scrollY;
  let ticking = false;

  const settle = () => {
    ticking = false;
    const y = Math.max(0, window.scrollY);
    const dy = y - lastY;
    if (Math.abs(dy) < THRESHOLD) return;

    // Near the top the chrome is always available, whichever way we moved.
    const next = y <= TOP_ZONE ? false : dy > 0;
    lastY = y;

    if (next === hidden) return;
    hidden = next;
    listeners.forEach(fn => fn(hidden));
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(settle);
  }, { passive: true });
}

/**
 * `true` while the chrome should be tucked away. Always `false` when the user
 * prefers reduced motion — moving chrome is the kind of movement that setting
 * asks us not to do.
 */
export function useChromeAutoHide(): boolean {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    start();
    setIsHidden(hidden);
    listeners.add(setIsHidden);
    return () => { listeners.delete(setIsHidden); };
  }, []);

  return isHidden;
}
