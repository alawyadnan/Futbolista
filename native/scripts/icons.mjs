import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = new URL('../../', import.meta.url);
const assets = new URL('../ios/App/App/Assets.xcassets/', import.meta.url);
export const WEB_ICONS = [
  ['icon-192.png', 192], ['icon-512.png', 512],
  ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]
];

// Render the vector at double density, then downsample rather than enlarging a
// previous PNG. All platforms share one mark; Apple applies its own corner mask.
export function renderBrandIcon(logo, size) {
  return sharp(logo, {density: 192}).resize(size, size, {kernel: 'lanczos3'})
    .flatten({background: '#043527'}).toColourspace('srgb').removeAlpha().png().toBuffer();
}

export async function renderLaunchImage(logo) {
  const size = 390;
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="88" fill="white"/></svg>`);
  const tile = await sharp(await renderBrandIcon(logo, size)).ensureAlpha()
    .composite([{input: mask, blend: 'dest-in'}]).png().toBuffer();
  return sharp({create: {width: 2732, height: 2732, channels: 3, background: '#07110d'}})
    .composite([{input: tile, gravity: 'centre'}]).removeAlpha().png().toBuffer();
}

export async function buildBrandAssets({web = true, native = true} = {}) {
  const logo = await readFile(new URL('icon.svg', root));
  if (web) {
    for (const [name, size] of WEB_ICONS) {
      await sharp(await renderBrandIcon(logo, size)).toFile(fileURLToPath(new URL(name, root)));
    }
  }
  if (native) {
    await sharp(await renderBrandIcon(logo, 1024))
      .toFile(fileURLToPath(new URL('AppIcon.appiconset/AppIcon-512@2x.png', assets)));
    const launch = await renderLaunchImage(logo);
    for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
      await sharp(launch).toFile(fileURLToPath(new URL(`Splash.imageset/${name}`, assets)));
    }
  }
  console.log('Rendered web/iOS brand assets from icon.svg; no upload or database access.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--web-only', '--native-only'].includes(arg)) || args.length > 1) {
    throw new Error('Use no argument, --web-only or --native-only.');
  }
  await buildBrandAssets({web: !args.includes('--native-only'), native: !args.includes('--web-only')});
}
