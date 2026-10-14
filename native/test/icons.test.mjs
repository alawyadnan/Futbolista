import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {WEB_ICONS, renderBrandIcon} from '../scripts/icons.mjs';

const root = new URL('../../', import.meta.url);
const assets = new URL('../ios/App/App/Assets.xcassets/', import.meta.url);
const source = await readFile(new URL('icon.svg', root));

test('approved football mark retains three motion lines, no F or sweep, and accessible vector text', () => {
  const svg = source.toString();
  assert.match(svg, /viewBox="0 0 1024 1024"/);
  assert.match(svg, /aria-labelledby="title desc"/);
  assert.match(svg, /<title id="title">Futbolista/);
  for (const line of ['M188 424h42', 'M158 512h66', 'M188 600h42']) assert.ok(svg.includes(line));
  assert.match(svg, /circle cx="566" cy="512" r="280"/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|https?:\/\/(?!www\.w3\.org)/);
  assert.doesNotMatch(svg, /M529 450|M450 180/);
});

test('web and Apple icons are opaque, correctly sized and rendered from the same SVG', async () => {
  const targets = WEB_ICONS.map(([file, size]) => [new URL(file, root), size]);
  targets.push([new URL('AppIcon.appiconset/AppIcon-512@2x.png', assets), 1024]);
  for (const [file, size] of targets) {
    const actual = await readFile(file);
    const metadata = await sharp(actual).metadata();
    assert.equal(metadata.width, size, file.href);
    assert.equal(metadata.height, size, file.href);
    assert.equal(metadata.hasAlpha, false, file.href);
    const expected = await renderBrandIcon(source, size);
    assert.deepEqual(await sharp(actual).raw().toBuffer(), await sharp(expected).raw().toBuffer(), file.href);
  }
});

test('football and motion marks fit within the maskable icon central safe circle', async () => {
  const {data, info} = await sharp(await renderBrandIcon(source, 1024)).raw().toBuffer({resolveWithObject: true});
  let foreground = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * info.channels;
    // The bright ball/marks are well above the dark background's green range.
    if (data[offset + 1] > 180 && data[offset] > 70) {
      foreground++;
      assert.ok(Math.hypot(x - 512, y - 512) <= 409.6, `foreground outside safe circle at ${x},${y}`);
    }
  }
  assert.ok(foreground > 100000, 'the foreground must be visible, not an empty icon');
});

test('all launch variants are opaque, identically sized and use one generated image', async () => {
  const files = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
  const images = await Promise.all(files.map(file => readFile(new URL(`Splash.imageset/${file}`, assets))));
  for (const image of images) {
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 2732);
    assert.equal(metadata.height, 2732);
    assert.equal(metadata.hasAlpha, false);
    assert.deepEqual(image, images[0]);
  }
});
