'use client';
import dynamic from 'next/dynamic';

/**
 * Agentation — click any element on the page, leave a note, and copy
 * structured output (CSS selector, element path, React component, source file)
 * to paste straight into Claude Code.
 *
 * Loaded with ssr:false because the toolbar renders through a portal into
 * document.body, and gated on NODE_ENV so it is never in a production bundle.
 */
const Agentation = dynamic(() => import('agentation').then((m) => m.Agentation), {
  ssr: false,
});

export function DevAnnotation() {
  if (process.env.NODE_ENV === 'production') return null;
  return <Agentation />;
}
