/**
 * zuck.js ships a `types` field in package.json pointing at real .d.ts
 * files, but its `exports` map doesn't expose them for the "." subpath —
 * TypeScript's exports-aware resolution can't find them from a plain
 * `import ... from 'zuck.js'`, and dist has no bundled CSS type either.
 * Minimal ambient shim so the app can import both without either failing.
 */
declare module 'zuck.js' {
  const Zuck: (el: HTMLElement, options: Record<string, unknown>) => unknown;
  export default Zuck;
}

declare module 'zuck.js/css';
