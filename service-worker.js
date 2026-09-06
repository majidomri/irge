/**
 * InstaRishta service worker, built on Workbox.
 *
 * The Workbox runtime is imported from our own origin (ci/build-sw.mjs copies
 * it into workbox/), never a CDN -- a service worker that needs the network to
 * boot is no use to someone who has none.
 *
 * Strategies deliberately differ from the Workbox "page cache" recipe, which
 * puts navigations behind CacheFirst. Profiles and listings change here, so a
 * navigation goes to the network first and falls back to the cache; only the
 * things that are safe to serve stale are served stale.
 */
importScripts("./workbox/workbox-sw.js");

workbox.setConfig({ modulePathPrefix: "./workbox/" });

const { precacheAndRoute, matchPrecache } = workbox.precaching;
const { registerRoute, setCatchHandler } = workbox.routing;
const { NetworkFirst, StaleWhileRevalidate } = workbox.strategies;
const { CacheableResponsePlugin } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;
const { clientsClaim } = workbox.core;

const OFFLINE_URL = "./offline.html";

self.skipWaiting();
clientsClaim();

/**
 * Build-time manifest: one entry per precached file, each with a revision hash.
 * `|| []` keeps this file runnable straight from the repo root in `npm run dev`,
 * where nothing has injected a manifest yet.
 */
precacheAndRoute(self.__WB_MANIFEST || []);

/** Same-origin GETs only; everything else falls through to the network. */
function sameOriginGet({ request, url }) {
  return request.method === "GET" && url.origin === self.location.origin;
}

/**
 * Navigations: network first. A fresh page when we can get one, the last copy
 * we saw when we cannot.
 */
registerRoute(
  ({ request, url }) =>
    sameOriginGet({ request, url }) &&
    (request.mode === "navigate" || request.destination === "document"),
  new NetworkFirst({
    cacheName: "page-cache",
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/**
 * Profile data: network first as well, and never served stale for long -- a
 * listing that has been withdrawn should not keep appearing.
 */
registerRoute(
  ({ request, url }) =>
    sameOriginGet({ request, url }) && url.pathname.endsWith("jsdata.json"),
  new NetworkFirst({
    cacheName: "data-cache",
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 8,
        maxAgeSeconds: 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/**
 * Scripts, styles and workers that the precache manifest did not cover
 * (anything added at runtime): serve from cache, refresh in the background.
 */
registerRoute(
  ({ request, url }) =>
    sameOriginGet({ request, url }) &&
    ["style", "script", "worker"].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: "asset-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/**
 * Images and the voice samples. Capped by count as well as age, because this
 * is the cache that grows without anyone noticing.
 */
registerRoute(
  ({ request, url }) =>
    sameOriginGet({ request, url }) &&
    ["image", "audio", "font"].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: "media-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

/**
 * Last resort. A navigation that neither the network nor any cache could
 * satisfy gets our own offline page instead of the browser's error screen.
 */
setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate" || request.destination === "document") {
    const offline = await matchPrecache(OFFLINE_URL);
    if (offline) return offline;

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return Response.error();
});
