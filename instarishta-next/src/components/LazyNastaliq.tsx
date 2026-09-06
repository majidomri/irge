'use client';

import { useEffect } from 'react';

/**
 * Noto Nastaliq Urdu, loaded late and from our own origin.
 *
 * The calligraphic Urdu face is a visual upgrade, not LCP-critical: Naskh
 * ships synchronously via next/font and renders every Urdu string correctly
 * while this is still downloading. So it stays deferred to idle — that part
 * of the original design was right and is unchanged.
 *
 * What changed is where it comes from and how much of it arrives.
 *
 * It used to inject a <link> to fonts.googleapis.com, which meant a CSS
 * request to one third-party origin and then a font request to a second
 * (fonts.gstatic.com) — two DNS lookups and two TLS handshakes to hosts the
 * page had no other reason to contact, since next/font self-hosts Inter and
 * Naskh. Now it is one same-origin request for a file we serve.
 *
 * It also pulled all three subsets Google publishes: arabic at 239 KB, plus
 * latin and latin-ext at 31 KB together. Those Latin subsets were not idle
 * curiosity — listing bodies routinely mix scripts ("B.com", "MBA (UK)",
 * "well settled"), so Latin characters really were being rendered inside
 * Nastaliq elements and really did pull those files. Only the arabic subset
 * is self-hosted, and the unicode-range below stops Latin from reaching for
 * it at all: mixed-script text now falls back to Inter for the Latin runs,
 * which is better typography as well as less bytes. Nastaliq's own Latin
 * glyphs are an afterthought in a face designed for Urdu.
 *
 * Licensed under the SIL Open Font License 1.1 — see public/fonts/OFL.txt.
 */

const STYLE_ID = 'lazy-nastaliq';

/**
 * Exactly the range Google serves for its arabic subset. Without it the
 * browser would use this face for Latin text too, and there are no Latin
 * glyphs in the file — every Latin character would fall to the next family
 * anyway, after the download.
 */
const ARABIC_RANGE =
  'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, ' +
  'U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, ' +
  'U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, ' +
  'U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, ' +
  'U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, ' +
  'U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, ' +
  'U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, ' +
  'U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, ' +
  'U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, ' +
  'U+1EEAB-1EEBB, U+1EEF0-1EEF1';

const FONT_FACE = `@font-face {
  font-family: 'Noto Nastaliq Urdu';
  font-style: normal;
  /* One variable file covers the whole weight range. */
  font-weight: 400 700;
  font-display: swap;
  src: url('/fonts/noto-nastaliq-urdu-arabic.woff2') format('woff2');
  unicode-range: ${ARABIC_RANGE};
}`;

export default function LazyNastaliq() {
  useEffect(() => {
    // Across client navigations this component remounts; the face is global.
    if (document.getElementById(STYLE_ID)) return;

    const inject = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = FONT_FACE;
      document.head.appendChild(style);
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const hasIdle = typeof w.requestIdleCallback === 'function';
    const handle = hasIdle
      ? w.requestIdleCallback!(inject, { timeout: 3000 })
      : window.setTimeout(inject, 200);

    return () => {
      if (hasIdle) w.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return null;
}
