const CACHE_NAME = "instarishta-v19";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./4.html",
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
  "./js/app/modules/admin-controller.js",
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

async function cachePutSafe(request, response) {
  if (!response || !response.ok) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Ignore cache write failures (unsupported scheme/quota/opaque edge cases).
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
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

  const isData = url.pathname.endsWith("/jsdata.json")
    || url.pathname.endsWith("jsdata.json");
  const isScriptLike = request.destination === "script"
    || request.destination === "worker";

  if (isData) {
    event.respondWith(
      fetch(request)
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
      fetch(request)
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

