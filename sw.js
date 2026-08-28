/**
 * Lightning Radar — PWA Service Worker
 * Caches app shell assets for instant startup and offline readiness.
 */

const CACHE_NAME = "lightning-radar-v3.2";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css?v=3.2",
  "js/audio.js?v=3.2",
  "js/radar.js?v=3.2",
  "js/stations.js?v=3.2",
  "js/renderer.js?v=3.2",
  "js/app.js?v=3.2",
  "manifest.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png"
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
