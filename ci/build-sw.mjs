/**
 * Builds the service worker.
 *
 * Runs *after* ci/build-static.mjs, because it hashes the minified files that
 * are actually served -- and because build-static copies the repo-root
 * service-worker.js into dist, so injecting first would just be overwritten.
 *
 * Two jobs:
 *
 *   1. Copy the Workbox runtime into `workbox/` at the repo root. The service
 *      worker importScripts() it from its own origin rather than a CDN, so a
 *      visitor with no network still gets a working service worker.
 *   2. Inject a precache manifest into `service-worker.js`. Each entry carries
 *      a revision hash of the file's contents, which is what replaces the old
 *      hand-maintained CORE_ASSETS list and its manual cache-version bump: a
 *      changed file changes its hash, so Workbox re-fetches exactly that file
 *      and leaves the rest of the cache alone.
 *
 * Run with --libs-only to do just (1) -- that is what `npm run dev` needs,
 * since the repo root is served directly and the manifest is a build artifact.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { copyWorkboxLibraries, injectManifest } from "workbox-build";

const rootDir = process.cwd();
const libsDir = path.join(rootDir, "workbox");
const libsOnly = process.argv.includes("--libs-only");
const outDir = path.join(rootDir, process.env.OUT_DIR || "dist");

/** Everything the app needs to render a page with no network. */
const PRECACHE_GLOBS = [
  "index.html",
  "offline.html",
  "about-instarishta.html",
  "what-is-instarishta.html",
  "how-instarishta-works.html",
  "muslim-marriage-guide.html",
  "muslim-matrimony-*.html",
  "post-your-ad.html",
  "manifest.webmanifest",
  "assets/icon.svg",
  "styles/**/*.css",
  "src/**/*.css",
  "js/app/**/*.js",
];

async function copyLibs(destDir) {
  const libsDir = destDir;
  // copyWorkboxLibraries creates a versioned subdirectory; clear the old one
  // first so upgrades do not leave two runtimes behind.
  await fs.rm(libsDir, { recursive: true, force: true });
  await fs.mkdir(libsDir, { recursive: true });
  const versioned = await copyWorkboxLibraries(libsDir);

  // Flatten it, so the service worker can import a stable path.
  const from = path.join(libsDir, versioned);
  for (const entry of await fs.readdir(from)) {
    await fs.rename(path.join(from, entry), path.join(libsDir, entry));
  }
  await fs.rm(from, { recursive: true, force: true });

  return versioned;
}

async function build() {
  // The repo root copy is what `npm run dev` serves.
  const versioned = await copyLibs(libsDir);
  console.log(`Workbox runtime: workbox/ (${versioned})`);
  if (libsOnly) return;

  await fs.mkdir(outDir, { recursive: true });
  await copyLibs(path.join(outDir, "workbox"));

  // Hash the built output, not the sources.
  const { count, size, warnings } = await injectManifest({
    swSrc: path.join(rootDir, "service-worker.js"),
    swDest: path.join(outDir, "service-worker.js"),
    globDirectory: outDir,
    globIgnores: ["workbox/**", "service-worker.js"],
    globPatterns: PRECACHE_GLOBS,
    // Served at "/", and precached under that name by the manifest entry
    // for index.html.
    modifyURLPrefix: { "": "./" },
    dontCacheBustURLsMatching: /\.\w{8}\./,
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  });

  for (const warning of warnings) console.warn(warning);
  console.log(
    `Precache manifest: ${count} files, ${(size / 1024).toFixed(1)} KiB`
  );
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
