import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translate } from '../i18n.js';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('new UI strings exist in Arabic and English with identical interpolation names',()=>{
  const texts=['app.js','community.js','index.html'].map(read).join('\n');
  const keys=new Set([...texts.matchAll(/\bt\(["']([A-Za-z]\w*)["']/g)].map(match=>match[1]));
  for(const match of texts.matchAll(/data-i18n(?:-aria|-placeholder)?=["'](\w+)["']/g))keys.add(match[1]);
  for(const key of keys) {
    const placeholders = {};
    for(const language of ['en','ar']) {
      const accessed = new Set();
      const variables = new Proxy({}, {get: (_target, name) => { accessed.add(name); return ''; }});
      assert.notEqual(translate(language,key,variables),key,`${language}: ${key}`);
      placeholders[language] = [...accessed].sort();
    }
    assert.deepEqual(placeholders.ar, placeholders.en, `interpolation: ${key}`);
  }
});
test('comparison is embedded in the profile with one opponent selector and no standalone navigation',()=>{
  const index=read('index.html');
  assert.ok(index.indexOf('id="profileComparison"') > index.indexOf('id="screen-playerprofile"'));
  assert.doesNotMatch(index,/screen-compare|data-nav="compare"|cmpPlayerA|btnSwapPlayers/);
  assert.doesNotMatch(read('app.js'),/cmpPlayerA|pendingCompareRoute|screen-compare/);
  assert.equal((index.match(/id="cmpPlayerB"/g)||[]).length,1);
});
test('community rollout is disabled and emulator routing is explicit and loopback-only',()=>{
  assert.match(read('community-config.js'),/COMMUNITY_ENABLED = false/);
  const app=read('app.js');
  assert.match(app,/\['127\.0\.0\.1', 'localhost'\]\.includes\(location\.hostname\)/);
  assert.match(app,/get\('emulator'\) === '1'/);
  assert.match(app,/projectId: 'demo-futbolista'/);
  assert.match(app,/connectFirestoreEmulator\(db, '127\.0\.0\.1', 8080\)/);
});
test('backup exports canonical players and raw logs, never cosmetic overlays or account data',()=>{
  const source=read('app.js').slice(read('app.js').indexOf('function exportJSON'));
  assert.match(source,/players: rawPlayers/);
  assert.match(source,/logs:\s*rawLogs/);
  assert.doesNotMatch(source,/users:|ballots:|playerProfiles:/);
});
test('public profiles never issue writes to the authoritative football collections',()=>{
  const source=read('community.js');
  assert.doesNotMatch(source,/addDoc|deleteDoc/);
  assert.doesNotMatch(source,/(?:setDoc|updateDoc)\(doc\(db,\s*['"](?:players|logs)['"]/);
  assert.match(source,/runTransaction/);
  assert.match(source,/isDataReady\(\)/);
});
test('admin entry atomically starts automatic voting; no separate completion action remains',()=>{
  const app=read('app.js'),community=read('community.js');
  assert.match(app,/community\.saveMatchEntry\(entry\)/);
  assert.match(community,/if \(!admin \|\| !isDataReady\(\)\) throw/);
  assert.match(community,/transaction\.set\(entryRef,entry\)/);
  assert.match(community,/firstEntryId:entryRef\.id,openedAt:serverTimestamp\(\)/);
  assert.doesNotMatch(community,/completeSessionForm|confirmSessionComplete|sessionAlreadyOpen/);
});
test('default tests never invoke Firebase, and write-based tools require explicit opt-in',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test,'node --test test/*.test.js');
  for(const file of ['rules-test/community.rules.test.js','scripts/seed-community-emulator.mjs']) {
    assert.match(read(file),/FUTBOLISTA_ALLOW_EMULATOR_WRITES !== '1'/);
    assert.match(read(file),/projectId:'demo-futbolista'/);
  }
});
test('content visibility is independent of entrance animation progress',()=>{
  const css=read('styles.css');
  assert.doesNotMatch(css,/@keyframes (?:screen-in|details-in)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/animation:none!important;transition:none!important/);
});
