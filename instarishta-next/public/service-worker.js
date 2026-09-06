/**
 * InstaRishta service worker.
 *
 * Replaces the kill-switch that retired the old static site's worker. That
 * cleanup still happens: activate deletes every cache this version does not
 * own, which covers the legacy `instarishta-v*` caches belonging to anyone who
 * never came back to run the kill-switch.
 *
 * Strategies follow the PWA codelabs with one deliberate departure. The Workbox
 * "page cache" recipe puts navigations behind CacheFirst, which on a matrimony
 * site would keep serving withdrawn listings for weeks. Navigations are network
 * first here; only what is safe stale is served stale.
 */
const VERSION = "v1";
const PRECACHE = `ir-precache-${VERSION}`;
const PAGES = `ir-pages-${VERSION}`;
const ASSETS = `ir-assets-${VERSION}`;
const MEDIA = `ir-media-${VERSION}`;
const OWNED = new Set([PRECACHE, PAGES, ASSETS, MEDIA]);

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg", "/logo.svg"];

/** Caps, so no cache grows without anyone noticing. */
const LIMITS = { [PAGES]: 60, [ASSETS]: 120, [MEDIA]: 120 };

async function trim(cacheName) {
  const limit = LIMITS[cacheName];
  if (!limit) return;

  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  // Cache keys come back in insertion order, so the front is the oldest.
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) {
    await cache.delete(key);
  }
}

async function put(cacheName, request, response) {
  if (!response || !response.ok) return;

  // Clone synchronously. Once the page starts reading the body it was also
  // handed, a later clone() throws and the write is silently lost.
  let copy;
  try {
    copy = response.clone();
  } catch {
    return;
  }

  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, copy);
    await trim(cacheName);
  } catch {
    // Quota, or an unsupported scheme. Not worth failing the request over.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // One missing file must not block activation.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      // Inherits the kill-switch's job: anything not ours goes.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !OWNED.has(key)).map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

function isSameOriginGet(request, url) {
  return request.method === "GET" && url.origin === self.location.origin;
}

/** Signed-in and privileged surfaces never touch the cache. */
function isPrivate(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/nizam") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/pay")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!isSameOriginGet(request, url) || isPrivate(url.pathname)) return;

  const isNavigation =
    request.mode === "navigate" || request.destination === "document";

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) {
            event.waitUntil(put(PAGES, request, preloaded));
            return preloaded;
          }

          const response = await fetch(request);
          event.waitUntil(put(PAGES, request, response));
          return response;
        } catch {
          // This page if we have it, then the offline page.
          const cached = await caches.match(request);
          if (cached) return cached;

          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;

          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // Next's build output is content-hashed, so a hit is always correct and a
  // miss is always a genuinely different file. Cache first, never revalidate.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          event.waitUntil(put(ASSETS, request, response));
          return response;
        });
      })
    );
    return;
  }

  const destination = request.destination;
  const cacheName = ["image", "audio", "video", "font"].includes(destination)
    ? MEDIA
    : ["style", "script", "worker"].includes(destination)
      ? ASSETS
      : null;

  // Anything else goes straight to the network.
  if (!cacheName) return;

  // Stale while revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          event.waitUntil(put(cacheName, request, response));
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
