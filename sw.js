const CACHE_NAME = "pocketdrop-shell-v108";
const IMG_CACHE = "pocketdrop-img-v1";
const LIB_CACHE = "pocketdrop-lib-v1";
const IMG_MAX = 4000;
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.png", "./hero.png", "./logo-halloween.png"];
const KEEP = [CACHE_NAME, IMG_CACHE, LIB_CACHE];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function trimCache(name, max) {
  caches.open(name).then((c) => c.keys().then((ks) => {
    if (ks.length > max) ks.slice(0, ks.length - max).forEach((k) => c.delete(k));
  })).catch(() => {});
}

// Network with timeout: slow connections fall back to the cache.
function fetchTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function cacheFirst(req, cacheName, max) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // ok responses and opaque (no-cors) responses are both usable for <img>
        if (res && (res.ok || res.type === "opaque")) {
          cache.put(req, res.clone()).then(() => { if (max && Math.random() < 0.04) trimCache(cacheName, max); }).catch(() => {});
        }
        return res;
      });
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    // Card/set images: remember them, so they also show without internet.
    if (req.destination === "image" && url.protocol === "https:") {
      event.respondWith(cacheFirst(req, IMG_CACHE, IMG_MAX).catch(() => Response.error()));
      return;
    }
    // Scanner libraries (Tesseract etc.) from CDN: cache once.
    if (/(^|\.)jsdelivr\.net$|(^|\.)unpkg\.com$|(^|\.)cdnjs\.cloudflare\.com$/.test(url.hostname)) {
      event.respondWith(cacheFirst(req, LIB_CACHE, 0).catch(() => Response.error()));
      return;
    }
    // Sheet CSV, Apps Script: untouched (the app has its own fallback).
    return;
  }

  const isHTML = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");

  if (isHTML) {
    event.respondWith(
      fetchTimeout(req, 4000)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
