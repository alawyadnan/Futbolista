import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const origin = "https://ftbll.live";

function workerHarness({ network, failOpen = false, failPut = false, failMatch = false } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const deleted = [];
  let claimed = false;
  const keyFor = request => {
    const url = new URL(typeof request === "string" ? request : request.url, `${origin}/`);
    url.hash = "";
    return url.href;
  };
  const withoutSearch = key => {
    const url = new URL(key);
    url.search = "";
    return url.href;
  };
  const storeFor = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const caches = {
    async open(name) {
      if (failOpen) throw new Error("Cache storage unavailable");
      const entries = storeFor(name);
      return {
        async match(request, { ignoreSearch = false } = {}) {
          if (failMatch) throw new Error("Cache read unavailable");
          const key = keyFor(request);
          const entry = ignoreSearch
            ? [...entries].find(([candidate]) => withoutSearch(candidate) === withoutSearch(key))?.[1]
            : entries.get(key);
          return entry?.clone();
        },
        async put(request, response) {
          if (failPut) throw new Error("Cache quota exceeded");
          entries.set(keyFor(request), response.clone());
        },
        async addAll(requests) {
          for (const request of requests) entries.set(keyFor(request), new Response("precache"));
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) {
      deleted.push(name);
      return stores.delete(name);
    },
    async match() {
      throw new Error("Global cache lookup must not cross application or release boundaries");
    }
  };
  const context = vm.createContext({
    URL, Response, caches,
    fetch: network || (async () => new Response("fresh network")),
    self: {
      location: { origin },
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => { claimed = true; } }
    }
  });
  vm.runInContext(workerSource, context);
  const cacheName = vm.runInContext("CACHE", context);
  return {
    cacheName, deleted,
    get claimed() { return claimed; },
    seed(path, text, name = cacheName) {
      storeFor(name).set(keyFor(path), new Response(text));
    },
    async cachedText(path) { return storeFor(cacheName).get(keyFor(path))?.clone().text(); },
    request(path, { mode = "cors", method = "GET" } = {}) {
      let response;
      listeners.get("fetch")({
        request: { url: new URL(path, `${origin}/`).href, mode, method },
        respondWith(value) { response = value; }
      });
      return response;
    },
    async activate() {
      let completion;
      listeners.get("activate")({ waitUntil(value) { completion = value; } });
      await completion;
    }
  };
}

test("successful responses survive unavailable or full cache storage", async t => {
  for (const failure of ["failOpen", "failPut"]) {
    for (const mode of ["navigate", "cors"]) {
      await t.test(`${failure}: ${mode}`, async () => {
        const worker = workerHarness({ [failure]: true });
        const response = await worker.request(mode === "navigate" ? "/?release=new" : "/app.js?v=new", { mode });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "fresh network");
      });
    }
  }
});

test("navigation falls back to the current cached shell during a server failure", async () => {
  const worker = workerHarness({ network: async () => new Response("unavailable", { status: 503 }) });
  worker.seed("/index.html", "current shell");
  const response = await worker.request("/?release=new#players", { mode: "navigate" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "current shell");
});

test("navigation preserves HTTP 404 and uncached server failures", async () => {
  const missing = workerHarness({ network: async () => new Response("missing page", { status: 404 }) });
  missing.seed("/index.html", "cached shell");
  const missingResponse = await missing.request("/missing", { mode: "navigate" });
  assert.equal(missingResponse.status, 404);
  assert.equal(await missingResponse.text(), "missing page");

  const unavailable = workerHarness({ network: async () => new Response("unavailable", { status: 503 }) });
  const unavailableResponse = await unavailable.request("/", { mode: "navigate" });
  assert.equal(unavailableResponse.status, 503);
  assert.equal(await unavailableResponse.text(), "unavailable");
});

test("asset server failures prefer the exact cached query before the query fallback", async () => {
  const worker = workerHarness({ network: async () => new Response("bad gateway", { status: 502 }) });
  worker.seed("/app.js?v=old", "other query");
  worker.seed("/app.js?v=current", "exact query");
  assert.equal(await (await worker.request("/app.js?v=current")).text(), "exact query");
  assert.equal(await (await worker.request("/app.js?v=missing")).text(), "other query");
});

test("asset 404 responses are not replaced by cached files", async () => {
  const worker = workerHarness({ network: async () => new Response("missing asset", { status: 404 }) });
  worker.seed("/app.js?v=current", "cached asset");
  const response = await worker.request("/app.js?v=current");
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "missing asset");
});

test("successful navigation and assets are cached without consuming the response", async () => {
  const worker = workerHarness();
  const page = await worker.request("/?release=current", { mode: "navigate" });
  const asset = await worker.request("/styles.css?v=current");
  assert.equal(await page.text(), "fresh network");
  assert.equal(await asset.text(), "fresh network");
  assert.equal(await worker.cachedText("/index.html"), "fresh network");
  assert.equal(await worker.cachedText("/styles.css?v=current"), "fresh network");
});

test("failed network responses never overwrite a previously working cache entry", async () => {
  const worker = workerHarness({ network: async () => new Response("failed", { status: 500 }) });
  worker.seed("/index.html", "working page");
  worker.seed("/app.js?v=current", "working script");
  await worker.request("/", { mode: "navigate" });
  await worker.request("/app.js?v=current");
  assert.equal(await worker.cachedText("/index.html"), "working page");
  assert.equal(await worker.cachedText("/app.js?v=current"), "working script");
});

test("offline fallback stays inside the current application cache", async () => {
  const worker = workerHarness({ network: async () => { throw new TypeError("offline"); } });
  worker.seed("/index.html", "unrelated page", "unrelated-cache");
  worker.seed("/app.js?v=current", "stale script", "futbolista-cache-old");
  assert.equal((await worker.request("/", { mode: "navigate" })).type, "error");
  assert.equal((await worker.request("/app.js?v=current")).type, "error");
  worker.seed("/index.html", "current page");
  worker.seed("/app.js?v=current", "current script");
  assert.equal(await (await worker.request("/", { mode: "navigate" })).text(), "current page");
  assert.equal(await (await worker.request("/app.js?v=another")).text(), "current script");
});

test("cache read failures yield a controlled network error when offline", async () => {
  const worker = workerHarness({ failMatch: true, network: async () => { throw new TypeError("offline"); } });
  assert.equal((await worker.request("/", { mode: "navigate" })).type, "error");
  assert.equal((await worker.request("/app.js")).type, "error");
});

test("the worker leaves cross-origin, non-GET, and unrelated requests alone", () => {
  const worker = workerHarness();
  assert.equal(worker.request("https://www.gstatic.com/firebasejs/firebase-app.js"), undefined);
  assert.equal(worker.request("/app.js", { method: "POST" }), undefined);
  assert.equal(worker.request("/api/players"), undefined);
});

test("activation deletes only old Futbolista caches and claims its clients", async () => {
  const worker = workerHarness();
  worker.seed("/", "current");
  worker.seed("/", "old", "futbolista-cache-v499999");
  worker.seed("/", "other app", "other-app-cache-v1");
  await worker.activate();
  assert.deepEqual(worker.deleted, ["futbolista-cache-v499999"]);
  assert.equal(worker.claimed, true);
  assert.equal(await worker.cachedText("/"), "current");
});
