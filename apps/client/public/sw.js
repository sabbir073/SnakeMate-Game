/* Nibblio service worker (spec §76): offline shell for STATIC assets only.
 * The multiplayer game itself requires a connection — never faked offline. */
const CACHE = "nibblio-static-v1";
const CORE = ["/", "/manifest.webmanifest", "/favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // never intercept realtime/API traffic
  if (url.pathname.startsWith("/ws") || url.pathname.startsWith("/api") ||
      url.pathname.startsWith("/matchmake")) return;

  const isHashedAsset = /\.(js|css|png|webp|mp3|woff2?|ttf)$/.test(url.pathname);
  if (isHashedAsset) {
    // cache-first: hashed/static assets are immutable
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ??
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
  } else {
    // network-first for HTML/manifest, cached fallback for offline shell
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match("/"))),
    );
  }
});
