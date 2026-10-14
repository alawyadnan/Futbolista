const CACHE_PREFIX = "futbolista-cache-";
const CACHE = `${CACHE_PREFIX}v500427`;

const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./policy.css",
  "./styles.css?v=500427",
  "./app.js?v=500427",
  "./data-engine.js?v=500427",
  "./i18n.js?v=500427",
  "./ux-utils.js?v=500427",
  "./platform.js?v=500427",
  "./platform-utils.js?v=500427",
  "./connectivity.js?v=500427",
  "./insights-engine.js?v=500427",
  "./detail-ui.js?v=500427",
  "./sports-ui.js?v=500427",
  "./personalization.js?v=500427",
  "./community-config.js?v=500427",
  "./community-engine.js?v=500427",
  "./community.js?v=500427",
  "./account-ux.js?v=500427",
  "./highlights.js?v=500427",
  "./award-statistics.js?v=500427",
  "./highlights-engine.js?v=500427",
  "./icon.svg?v=500427",
  "./icon-192.png?v=500427",
  "./icon-512.png?v=500427",
  "./icon-maskable-512.png?v=500427",
  "./apple-touch-icon.png?v=500427",
  "./manifest.json?v=500427"
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
  const path = new URL(request.url).pathname;
  const policyPage = /\/(?:privacy|support)\.html$/.test(path);
  const navigationKey = policyPage ? path : "./index.html";
  const fallback = () => policyPage ? cachedAsset(navigationKey) : cachedNavigation();
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cacheResponse(navigationKey, response);
    } else if (isServerError(response)) {
      return (await fallback()) || response;
    }
    return response;
  } catch {
    return (await fallback()) || Response.error();
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
