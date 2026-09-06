const CACHE_NAME = "instarishta-v32";

// Served when a navigation can be satisfied by neither network nor cache.
const OFFLINE_URL = "./offline.html";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./about-instarishta.html",
  "./what-is-instarishta.html",
  "./how-instarishta-works.html",
  "./muslim-marriage-guide.html",
  "./muslim-matrimony-hyderabad.html",
  "./muslim-matrimony-delhi.html",
  "./muslim-matrimony-mumbai.html",
  "./muslim-matrimony-bangalore.html",
  "./post-your-ad.html",
  "./robots.txt",
  "./sitemap.xml",
  "./llms.txt",
  "./styles/instarishta.css",
  "./src/output.css",
  "./js/app/main.js",
  "./js/app/config.js",
  "./js/app/state.js",
  "./js/app/utils.js",
  "./js/app/modules/filter-engine.js",
  "./js/app/modules/theme-controller.js",
  "./js/app/modules/typing-controller.js",
  "./js/app/modules/drawer-controller.js",
  "./js/app/modules/renderer.js",
  "./js/app/services/storage-service.js",
  "./js/app/services/activity-logger.js",
  "./js/app/services/contact-service.js",
  "./js/app/services/data-service.js",
  "./js/app/services/voice-preview-service.js",
  "./js/app/workers/filter-worker.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/voice/sample-voice-a.wav",
  "./assets/voice/sample-voice-b.wav",
  "./assets/voice/sample-voice-c.wav",
];

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

function isCacheableRequest(request, url) {
  if (request.method !== "GET") return false;
  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) return false;
  return url.origin === self.location.origin;
}

function cachePutSafe(request, response) {
  if (!response || !response.ok) return Promise.resolve();

  // The clone has to be taken synchronously. These responses are also handed
  // back to the page, and once the page starts reading the body a later
  // clone() throws -- so awaiting caches.open() first meant the write was
  // silently skipped for every response we actually served.
  let copy;
  try {
    copy = response.clone();
  } catch {
    return Promise.resolve();
  }

  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => {
      // Ignore cache write failures (unsupported scheme/quota/opaque edge cases).
    });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Best-effort warm cache: one missing asset should not block SW activation.
      await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Lets the browser start a navigation's network request in parallel with
  // service worker startup, rather than after it.
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
    })()
  );

  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;

  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!isCacheableRequest(request, url)) return;

  const isNavigationRequest =
    request.mode === "navigate" ||
    request.destination === "document" ||
    url.pathname.endsWith(".html");
  const isData = url.pathname.endsWith("/jsdata.json")
    || url.pathname.endsWith("jsdata.json");
  const isScriptLike = request.destination === "script"
    || request.destination === "worker";

  if (isNavigationRequest) {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) {
            event.waitUntil(cachePutSafe(request, preloaded));
            return preloaded;
          }

          const response = await fetch(request, { cache: "no-store" });
          event.waitUntil(cachePutSafe(request, response));
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

  if (isData) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          event.waitUntil(cachePutSafe(request, response));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw new Error("Network unavailable");
        })
    );
    return;
  }

  if (isScriptLike) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          event.waitUntil(cachePutSafe(request, response));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw new Error("Script unavailable");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => cachePutSafe(request, response))
            .catch(() => {})
        );
        return cached;
      }

      return fetch(request).then((response) => {
        event.waitUntil(cachePutSafe(request, response));
        return response;
      });
    })
  );
});

