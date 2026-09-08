import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(resolve(root, file), "utf8");

test("all public entry points use the same release version", () => {
  const version = "500401";
  const index = read("index.html");
  const app = read("app.js");
  const manifest = read("manifest.json");
  const worker = read("sw.js");

  assert.match(index, new RegExp(`styles\\.css\\?v=${version}`));
  assert.match(index, new RegExp(`app\\.js\\?v=${version}`));
  assert.match(index, new RegExp(`manifest\\.json\\?v=${version}`));
  assert.match(app, new RegExp(`data-engine\\.js\\?v=${version}`));
  assert.match(app, new RegExp(`i18n\\.js\\?v=${version}`));
  assert.match(app, new RegExp(`ux-utils\\.js\\?v=${version}`));
  assert.match(app, new RegExp(`sw\\.js\\?v=${version}`));
  assert.match(manifest, new RegExp(`\\?v=${version}#dashboard`));
  assert.match(worker, new RegExp(`v${version}`));
});

test("service worker precache files exist and offline fallbacks are guarded", () => {
  const worker = read("sw.js");
  const assetsBlock = worker.match(/const ASSETS = \[([\s\S]*?)\];/)?.[1] || "";
  const assets = [...assetsBlock.matchAll(/"\.\/(.*?)"/g)].map(match => match[1].split("?")[0]);
  for (const asset of assets.filter(Boolean)) {
    assert.equal(existsSync(resolve(root, asset)), true, `${asset} should exist`);
  }
  assert.match(worker, /await cache\.put/);
  assert.match(worker, /response\.ok/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(worker, /ignoreSearch: true/);
  assert.doesNotMatch(assetsBlock, /sw\.js/);
});
