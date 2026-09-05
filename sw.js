const CACHE_PREFIX = "futbolista-cache-";
const CACHE = `${CACHE_PREFIX}v500300`;

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=500300",
  "./app.js?v=500300",
  "./data-engine.js?v=500300",
  "./i18n.js?v=500300",
  "./ux-utils.js?v=500300",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png?v=500300",
  "./manifest.json?v=500300"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchAndCache(request) {
  const response = await fetch(request, { cache: "no-store" });
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  const isCoreAsset = /\.(?:js|css|json|png|svg)$/.test(url.pathname);
  if (!isCoreAsset) return;

  event.respondWith((async () => {
    try {
      return await fetchAndCache(request);
    } catch {
      return (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
