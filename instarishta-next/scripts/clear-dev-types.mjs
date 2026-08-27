/**
 * Remove `.next/dev/types` before a production build.
 *
 * Next deliberately adds `.next/dev/types/**\/*.ts` to tsconfig's include list
 * (to avoid churning the config when switching between dev and build), then
 * filters those files back out during `next build`. That filter is a no-op on
 * Windows:
 *
 *   type-paths.js   getDevTypesPath() -> path.join(...)  ->  ...\.next\dev\types
 *   runTypeCheck.js fileNames.filter(f => !f.startsWith(devTypesDir))
 *
 * TypeScript's parsed `fileNames` are always posix-style even on Windows, so
 * the backslash prefix never matches and dev types get type-checked in the
 * production build. A stale or half-written dev artifact then fails the build
 * with a syntax error in generated code nobody wrote — e.g. `nst handler = {}`
 * from a torn read while `next dev` was writing.
 *
 * Verified against next@16.2.4. Harmless on Linux/macOS, where the filter
 * already works and this directory is simply absent in CI.
 */
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devTypes = path.join(root, '.next', 'dev', 'types');

await rm(devTypes, { recursive: true, force: true });
