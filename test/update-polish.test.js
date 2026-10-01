import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { filterRankingRows, filterAndSortPlayers, matchesPlayerSearch, normalizeSearch } from '../ux-utils.js';
import { translate } from '../i18n.js';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('Arabic search ignores vowel marks, tatweel, hamza and extra spacing without changing stored names', () => {
  const players = [{id:'a',name:'أَحـمد علي'}, {id:'b',name:'مصطفى'}, {id:'c',name:'Sayed Hashim B'}];
  const before = JSON.stringify(players);
  assert.equal(filterAndSortPlayers(players, {}, 'علي احمد')[0].id, 'a');
  assert.equal(filterAndSortPlayers(players, {}, 'مصطفي')[0].id, 'b');
  assert.equal(filterAndSortPlayers(players, {}, '  HASHIM   Sayed ')[0].id, 'c');
  assert.equal(matchesPlayerSearch('Ali', 'Ali Hassan'), false);
  assert.equal(matchesPlayerSearch(undefined, ''), true);
  assert.equal(normalizeSearch('ＦＯＯ'), 'foo');
  assert.equal(JSON.stringify(players), before);
});

test('search preserves original competition ranks, ties and unearned awards', () => {
  const rows = [{id:'a',name:'Ali'},{id:'b',name:'Bader'},{id:'c',name:'Cameron'}];
  assert.equal(filterRankingRows(rows, 'Cameron')[0].displayRank, 3);
  const awards = [{...rows[0],rank:1},{...rows[1],rank:1},{...rows[2],rank:null}];
  assert.equal(filterRankingRows(awards, 'Bader')[0].displayRank, 1);
  assert.equal(filterRankingRows(awards, 'Cameron')[0].displayRank, null);
  assert.deepEqual(filterRankingRows(rows, 'absent'), []);
  assert.equal(Object.hasOwn(rows[0], 'displayRank'), false);
});

test('iOS 15.0 statistics and errors work without APIs first shipped in iOS 15.4', () => {
  const sources = ['community-engine.js','data-engine.js','highlights-engine.js','account-ux.js','ux-utils.js']
    .map(name => read(name).replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
  const result = runInNewContext(`Array.prototype.at = undefined; Object.hasOwn = undefined;\n${sources}\n
    ({empty:summarizeAwards().latest, trends:computeTrends(buildDataModel()).length,
      error:authFeedbackKey({code:'auth/invalid-credential'}),metric:buildRankingMetric({goals:3},'goals').value,
      rank:filterRankingRows([{name:'A'},{name:'B'}],'B')[0].displayRank});`);
  assert.equal(result.empty, null); assert.equal(result.trends, 0);
  assert.equal(result.error, 'accountSignInFailed'); assert.equal(result.metric, '3'); assert.equal(result.rank, 2);
});

test('new account and search messages have complete Arabic and English translations', () => {
  for (const lang of ['ar','en']) for (const key of ['searchResultsCount','deletionRequested','accountPaused','deletionActionsPaused']) {
    const text = translate(lang,key,{count:3,total:20});
    assert.notEqual(text,key); assert.doesNotMatch(text,/\{\w+\}/);
  }
});

test('opening a second player remembers the comparison route and original scroll position', () => {
  const source = read('app.js');
  const code = source.slice(source.indexOf('function openProfile('), source.indexOf('function renderPlayerProfile('));
  const trail = [], context = {
    document:{querySelector:()=>({id:'screen-playerprofile'})},
    window:{location:{hash:'#player/a/compare/b'},scrollY:1234},
    currentProfileId:'a',profileTrail:trail,comparisonOpen:true,comparisonPlayerId:'b',
    showAllTeammates:false,partnershipSort:'matches',
    showScreen(){},setActiveNav(){}
  };
  runInNewContext(`${code}\nopenProfile('b');`, context);
  assert.equal(trail.length, 1); assert.equal(trail[0].hash, '#player/a/compare/b');
  assert.equal(trail[0].scrollY, 1234); assert.equal(context.currentProfileId,'b');
  assert.equal(context.comparisonOpen,false);
});

test('ranking searches are labeled and version bump preserves bundle identity and iOS support', () => {
  const html = read('index.html');
  for (const id of ['leaderboardSearch','tableSearch']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.match(html,new RegExp(`id="${id}"[^>]+type="search"`));
    assert.ok(html.includes(`aria-describedby="${id}Count"`));
  }
  const project = read('native/ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((project.match(/MARKETING_VERSION = 1\.0\.2;/g)||[]).length,2);
  assert.equal((project.match(/CURRENT_PROJECT_VERSION = 10;/g)||[]).length,2);
  assert.equal(JSON.parse(read('native/package.json')).version,'1.0.2');
  assert.match(project,/PRODUCT_BUNDLE_IDENTIFIER = live\.ftbll\.futbolista/);
});
