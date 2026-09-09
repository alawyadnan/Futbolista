const CACHE_PREFIX = "futbolista-cache-";
const CACHE = `${CACHE_PREFIX}v500405`;

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=500405",
  "./app.js?v=500405",
  "./data-engine.js?v=500405",
  "./i18n.js?v=500405",
  "./ux-utils.js?v=500405",
  "./insights-engine.js?v=500405",
  "./personalization.js?v=500405",
  "./community-config.js?v=500405",
  "./community-engine.js?v=500405",
  "./community.js?v=500405",
  "./account-ux.js?v=500405",
  "./highlights.js?v=500405",
  "./award-statistics.js?v=500405",
  "./highlights-engine.js?v=500405",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png?v=500405",
  "./manifest.json?v=500405"
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

async function cacheResponse(request, response) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch {
    // A full or unavailable cache must not hide a successful network response.
  }
}

async function cachedAsset(request) {
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
  } catch {
    return undefined;
  }
}

async function cachedNavigation() {
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match("./index.html")) || (await cache.match("./"));
  } catch {
    return undefined;
  }
}

function isServerError(response) {
  return response.status >= 500 && response.status <= 599;
}

async function fetchAndCache(request) {
  const response = await fetch(request, { cache: "no-store" });
  if (response.ok) {
    await cacheResponse(request, response);
  } else if (isServerError(response)) {
    return (await cachedAsset(request)) || response;
  }
  return response;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cacheResponse("./index.html", response);
    } else if (isServerError(response)) {
      return (await cachedNavigation()) || response;
    }
    return response;
  } catch {
    return (await cachedNavigation()) || Response.error();
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
      return (await cachedAsset(request)) || Response.error();
    }
  })());
});
