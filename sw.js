const CACHE = "futbolista-cache-v101"; // غيّر الرقم كل مرة إذا احتجت

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./sw.js"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Network-first for HTML/JS/CSS so updates show immediately
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // فقط لملفات موقعك
  if (url.origin !== self.location.origin) return;

  // خذ أحدث نسخة للملفات الأساسية
  const isCore =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json");

  if (!isCore) return;

  e.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || fetch(req);
      }
    })()
  );
});
