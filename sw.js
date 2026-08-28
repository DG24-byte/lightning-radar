/**
 * Lightning Radar — PWA Service Worker
 * Caches app shell assets for instant startup and offline readiness.
 */

const CACHE_NAME = "lightning-radar-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/audio.js",
  "/js/radar.js",
  "/js/stations.js",
  "/js/renderer.js",
  "/js/app.js",
  "/manifest.json",
  "/icons/icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Pass through WebSocket, tile, and dynamic API requests directly to network
  if (
    e.request.url.includes("/ws") ||
    e.request.url.includes("/api/") ||
    e.request.url.includes("tile") ||
    e.request.url.includes("rainviewer") ||
    e.request.url.includes("lightningmaps.org")
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request);
    })
  );
});
