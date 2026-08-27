'use client';
import { useEffect } from 'react';

/**
 * Blocks copy/cut of profile content site-wide.
 *
 * A deterrent, not a security boundary. The markup still ships to the browser,
 * so anyone opening devtools or View Source has the text regardless — this only
 * raises the effort for casual scraping. It cannot prevent screenshots; no web
 * API can (see docs, and the per-card watermark that actually addresses that).
 *
 * Two deliberate non-goals:
 *
 *  - `contextmenu` is NOT blocked. /profiles opens the biodata sheet on right
 *    click (ProfilesClient's onContextMenu), so a global blocker would break a
 *    real feature to stop a menu the keyboard offers anyway.
 *  - Form fields are exempt. Blocking copy inside inputs breaks correcting a
 *    typo, and would make /nizam's admin textareas unusable.
 */
const isEditable = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node || typeof node.closest !== 'function') return false;
  return Boolean(node.closest('input, textarea, select, [contenteditable="true"], .selectable'));
};

export default function ContentProtection() {
  useEffect(() => {
    const block = (e: Event) => {
      if (isEditable(e.target)) return;   // let form fields behave normally
      e.preventDefault();
    };

    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', block);

    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('dragstart', block);
    };
  }, []);

  return null;
}
