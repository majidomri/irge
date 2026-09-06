/**
 * Direction, language and font for a run of listing text.
 *
 * Lifted out of app/profiles/_shared: components/BiodataView needed it, and a
 * shared component importing from a route folder is the dependency inversion
 * the ESLint boundary now forbids.
 */

export const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
// Calligraphic Nastaliq fonts first — Faiz Nastaleeq / Jameel Noori Nastaleeq
// are local on Pakistani user systems (free, instant). Noto Nastaliq Urdu is
// loaded asynchronously via <LazyNastaliq /> and swapped in after first paint.
// Noto Naskh Arabic (loaded synchronously via next/font) is the during-load
// fallback so Urdu text always renders correctly during LCP.
export const URDU_FONT =
  "'Faiz Nastaleeq','Jameel Noori Nastaleeq','Noto Nastaliq Urdu','Noto Naskh Arabic',serif";

export function textDir(text: string): 'rtl' | 'ltr' {
  return ARABIC_RE.test(text) ? 'rtl' : 'ltr';
}

/**
 * Everything a run of listing text needs to render correctly.
 *
 * `lang` is the part that kept getting left off. The document is lang="en", so
 * an Urdu title without it is announced by a screen reader in an English
 * voice, and read by a search engine as English. `dir` fixes bidi — where the
 * punctuation lands when Urdu and Latin share a line — and the font stack
 * picks Nastaliq.
 *
 * Spread onto the element: `<p {...rtlTextProps(title)}>`. Two copies of this
 * already existed as private helpers in BiodataSheet and BiodataView; this is
 * that logic, in one place, for every caller.
 */
export function rtlTextProps(text: string): {
  dir: 'rtl' | 'ltr';
  lang?: 'ur';
  style: { fontFamily: string };
} {
  const dir = textDir(text);
  return {
    dir,
    lang: dir === 'rtl' ? 'ur' : undefined,
    style: { fontFamily: dir === 'rtl' ? URDU_FONT : 'inherit' },
  };
}
