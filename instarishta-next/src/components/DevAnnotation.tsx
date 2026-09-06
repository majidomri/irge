'use client';
import dynamic from 'next/dynamic';

/**
 * Agentation — click any element on the page, leave a note, and copy
 * structured output (CSS selector, element path, React component, source file)
 * to paste straight into Claude Code.
 *
 * The previous version claimed to be "gated on NODE_ENV so it is never in a
 * production bundle". It was not. The guard was a runtime check inside the
 * component, while the dynamic() call sat at module scope and ran regardless,
 * so a 417 KB agentation chunk was emitted into every production build — the
 * largest chunk in the output. Nobody downloaded it, because the guard did
 * stop the component rendering, but it was still compiled and deployed.
 *
 * The gate is a module-scope constant now. NODE_ENV is substituted at build
 * time, so in production the ternary folds to `() => null` and the import
 * becomes unreachable code the bundler can drop.
 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const Agentation = IS_PRODUCTION
  ? () => null
  : dynamic(() => import('agentation').then((m) => m.Agentation), { ssr: false });

export function DevAnnotation() {
  return <Agentation />;
}
