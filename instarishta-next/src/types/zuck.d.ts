/**
 * zuck.js ships a `types` field in package.json pointing at real .d.ts
 * files, but its `exports` map doesn't expose them for the "." subpath —
 * TypeScript's exports-aware resolution can't find them from a plain
 * `import ... from 'zuck.js'`. Its bundled dist/zuck.js also doesn't match
 * its own .d.ts: the type declares `export default Zuck`, but the compiled
 * CommonJS output only ever sets `exports.Zuck` — there is no `.default`.
 * Confirmed by grepping the actual dist file after two runtime failures.
 * This shim reflects the real (named-export) shape, not the published type.
 */
declare module 'zuck.js' {
  export const Zuck: (el: HTMLElement, options: Record<string, unknown>) => unknown;
}

declare module 'zuck.js/css';
declare module 'zuck.js/skins/facesnap';
