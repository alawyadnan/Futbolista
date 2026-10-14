import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(resolve(root, file), "utf8");

test("all public entry points use the same release version", () => {
  const version = "500424";
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
  assert.match(index, new RegExp(`icon\\.svg\\?v=${version}`));
  for (const icon of JSON.parse(manifest).icons) {
    assert.ok(icon.src.endsWith(`?v=${version}`), `${icon.src} must bypass the previous icon cache`);
  }
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

test("compact account control keeps a localized accessible name and a decorative SVG", () => {
  const html = read("index.html");
  const button = html.match(/<button id="btnAccount"[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /data-i18n-aria="account"/);
  assert.match(button, /<svg[^>]*aria-hidden="true"/);
  assert.match(button, /<span class="account-button-label" data-i18n="account">/);
  assert.doesNotMatch(button, /<button[^>]*data-i18n="account"/);
});
