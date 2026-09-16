import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const assets=new URL('../ios/App/App/Assets.xcassets/',import.meta.url);
const logo=await readFile(new URL('icon.svg',root));
const icon=await sharp(logo).resize(1024,1024).flatten({background:'#07110d'}).png().toBuffer();
await sharp(icon).toFile(fileURLToPath(new URL('AppIcon.appiconset/AppIcon-512@2x.png',assets)));
const splash=await sharp({create:{width:2732,height:2732,channels:3,background:'#07110d'}})
  .composite([{input:await sharp(logo).resize(390,390).toBuffer(),gravity:'centre'}]).png().toBuffer();
for(const name of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])
  await sharp(splash).toFile(fileURLToPath(new URL(`Splash.imageset/${name}`,assets)));
console.log('Rendered opaque iOS icon and launch assets from the existing Futbolista SVG.');
