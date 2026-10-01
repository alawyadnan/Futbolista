import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildDataModel, emptyModel, computeHeadToHead} from '../data-engine.js';
import {computeComparisonWindow} from '../insights-engine.js';
import {buildMatchDates, filterMatches, buildPlayerAvatar, compareMetricValues, isValidISODate, compareRouteFor, parseAppRoute} from '../ux-utils.js';
import {nativeLinkRoute} from '../platform-utils.js';
import {translate, countText} from '../i18n.js';
import {renderDuelRecord} from '../detail-ui.js';

const players = [{id:'a',name:'Ali <script>'}, {id:'b',name:'Bader'}];
const logs = Array.from({length:8}, (_, i) => ({id:`a${i}`,playerId:'a',date:`2026-09-${String(i+1).padStart(2,'0')}`,side:'A',result:i===6?'loss':'win',goals:i===7?2:1}));
logs.push({...logs[7],id:'duplicate'}, {...logs[7],id:'own',ownGoal:true,goals:4}, {...logs[2],id:'b2',playerId:'b',side:'B',result:'loss'});
const model = buildDataModel(players, logs);
const source = readFileSync(new URL('../app.js',import.meta.url),'utf8');
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

test('recent comparison uses the latest five canonical appearances, not five group matches', () => {
  assert.deepEqual(computeComparisonWindow(model,'a','recent'), {matches:5,wins:4,draws:0,losses:1,goals:6,winPct:.8,gpm:1.2,current:1,best:3});
  assert.equal(computeComparisonWindow(model,'b','recent').matches,1);
  assert.equal(computeComparisonWindow(model,'b','recent').losses,1);
});
test('all-time comparison matches the established statistics engine exactly', () => {
  for (const player of players) {
    const actual = computeComparisonWindow(model,player.id);
    for (const [key,value] of Object.entries(actual)) assert.equal(value,model.stats[player.id][key], key);
  }
});
test('comparison excludes own goals and duplicate rows and never mutates the model', () => {
  const before = JSON.stringify([...model.byPlayer]);
  assert.equal(computeComparisonWindow(model,'a').goals,9);
  computeComparisonWindow(model,'a','recent');
  assert.equal(JSON.stringify([...model.byPlayer]),before);
});
test('empty comparison and unknown scope have safe deterministic behavior', () => {
  assert.equal(Object.values(computeComparisonWindow(emptyModel(),'absent','recent')).every(value => value === 0),true);
  assert.deepEqual(computeComparisonWindow(model,'a','bad'),computeComparisonWindow(model,'a'));
});
test('recent winning streak starts at the window boundary and respects draws', () => {
  const m = buildDataModel(players,logs.slice(0,6));
  assert.equal(computeComparisonWindow(m,'a','recent').best,5);
  const drawn = buildDataModel(players,[...logs.slice(0,6),{...logs[6],result:'draw'}]);
  assert.equal(computeComparisonWindow(drawn,'a','recent').current,0);
  assert.equal(computeComparisonWindow(drawn,'a','recent').draws,1);
});
test('date rail deduplicates dates, sorts newest first and leaves same-day games intact', () => {
  const matches=[{date:'2026-09-03'}, {date:'2026-09-01'}, {date:'2026-09-03'}, {date:'2026-02-30'}, {date:'oops'}];
  const before=JSON.stringify(matches);
  assert.deepEqual(buildMatchDates(matches),['2026-09-03','2026-09-01']);
  assert.equal(filterMatches(matches,undefined,'','all','','2026-09-03').length,2);
  assert.equal(JSON.stringify(matches),before);
  assert.deepEqual(buildMatchDates(matches,1),['2026-09-03']);
  assert.deepEqual(buildMatchDates([]),[]);
});
test('exact date intersects search, month and player ID without changing default filters', () => {
  const matches=[...model.matchSummaries.values()];
  const name=id=>players.find(p=>p.id===id)?.name;
  assert.equal(filterMatches(matches,name,'Bader','month:2026-09','a','2026-09-03').length,1);
  assert.equal(filterMatches(matches,name,'Bader','month:2026-09','a','2026-09-04').length,0);
  assert.equal(filterMatches(matches,name,'','month:2026-08','','2026-09-03').length,0);
  assert.equal(filterMatches(matches,name).length,8);
});
test('actual comparison renderer exposes the selected scope with honest partial counts', () => {
  const render=source.slice(source.indexOf('function renderCompare('),source.indexOf('/* =========================================================\n   HELPERS',source.indexOf('function renderCompare(')));
  for (const scope of ['all','recent']) for (const lang of ['en','ar']) {
    const box={innerHTML:''};
    const nodes={cmpPlayerB:{value:'b'},compareResult:box};
    runInNewContext(render+'\nrenderCompare();',{$:id=>nodes[id],currentProfileId:'a',players,model,comparisonScope:scope,
      computeComparisonWindow,computeFootballHeadToHead:computeHeadToHead,renderDuelRecord,language:lang,emptyStats:()=>({}),updatePageContext(){},
      t:key=>translate(lang,key),esc,buildPlayerAvatar,renderFormDots:()=>'',fmtPct:v=>Math.round(v*100)+'%',fmt2:v=>v.toFixed(2),compareMetricValues});
    assert.match(box.innerHTML,new RegExp(`data-compare-scope="${scope}" aria-pressed="true"`));
    assert.match(box.innerHTML,/Ali &lt;script&gt;/);
    assert.ok(box.innerHTML.includes(translate(lang,'allTime')));
    if(scope==='recent') assert.ok(box.innerHTML.includes(translate(lang,'recentFiveEach')));
    assert.doesNotMatch(box.innerHTML,/NaN|Infinity|undefined/);
  }
});
test('actual scorer renderer keeps own goals separate, safe names and tap targets', () => {
  const render=source.slice(source.indexOf('function sideLines('),source.indexOf('function renderPlayersAdmin('));
  const markup=runInNewContext(render+'\nsideLines(entries);',{entries:model.matchSummaries.get('2026-09-08').teamA,
    playerName:()=>players[0].name,esc,t:key=>translate('en',key),language:'en',countText});
  assert.match(markup,/Ali &lt;script&gt;/);
  assert.match(markup,/aria-label="2 goals"/);
  assert.match(markup,/own-goal-tag/);
  assert.equal((markup.match(/data-open-player=/g)||[]).length,1);
});
test('weekday labels reject malformed dates without throwing', () => {
  const code=source.slice(source.indexOf('function formatMatchWeekday('),source.indexOf('function renderHistoryDateRail('));
  const weekday=runInNewContext(code+'\nformatMatchWeekday;', {language:'en',isValidISODate,t:()=> 'Match'});
  assert.equal(weekday('2026-09-23'),'Wednesday');
  assert.equal(weekday('bad'),'Match');
});
test('new navigation and comparison labels exist in both languages', () => {
  for(const language of ['en','ar']) for(const key of ['matchDates','comparisonPeriod','recentFive','recentFiveEach']) assert.notEqual(translate(language,key),key);
});

test('recent comparison links preserve the period and old links keep all-time behavior', () => {
  const route=compareRouteFor('علي','b','recent');
  assert.equal(parseAppRoute(route).comparisonScope,'recent');
  assert.equal(nativeLinkRoute('https://ftbll.live/'+route),route);
  assert.equal(nativeLinkRoute('futbolista://app/'+route),route);
  assert.equal(compareRouteFor('a','b'),'#player/a/compare/b');
  assert.equal(parseAppRoute('#player/a/compare/b').comparisonScope,undefined);
  assert.equal(nativeLinkRoute('https://ftbll.live/#player/a/compare/b/delete'),null);
  assert.equal(nativeLinkRoute('https://ftbll.live/#player/a/compare/b/recent/extra'),null);
});

test('quick ranking buttons update state without replacing focused or scrolled nodes', () => {
  const render=source.slice(source.indexOf('function renderRankingShortcuts('),source.indexOf('function renderLeaderboard('));
  let writes=0;
  const buttons=['winPct','goals','motmAwards','votingPoints'].map(key=>({dataset:{rankingSort:key},setAttribute(_key,value){this.pressed=value;}}));
  const box={dataset:{},set innerHTML(value){this.markup=value;writes++;},querySelectorAll:()=>buttons};
  const fn=runInNewContext(render+'\nrenderRankingShortcuts;',{$:()=>box,language:'ar',communityEnabled:true,esc,t:key=>translate('ar',key)});
  fn('box','goals');fn('box','motmAwards');
  assert.equal(writes,1);assert.equal(buttons[1].pressed,'false');assert.equal(buttons[2].pressed,'true');
});

test('date selection resets when a search excludes the selected day', () => {
  const code=source.slice(source.indexOf('function renderHistoryDateRail('),source.indexOf('function resetHistoryControls('));
  const box={dataset:{},classList:{toggle(){}},querySelectorAll:()=>[]};
  const nodes={historyDateRail:box,historySearch:{value:'Bader'},historyPeriod:{value:'all'}};
  const context={$:id=>nodes[id],historyExactDate:'2026-09-08',historyPlayerId:'',language:'en',filterMatches,buildMatchDates,
    playerName:id=>players.find(p=>p.id===id)?.name,esc,t:key=>translate('en',key),formatMatchWeekday:()=> 'Monday',formatMatchDate:d=>d,formatMonthLabel:d=>d};
  runInNewContext(code+'\nrenderHistoryDateRail(matches);',{...context,matches:[...model.matchSummaries.values()]});
  assert.match(box.innerHTML,/data-history-date="2026-09-03"/);
  assert.doesNotMatch(box.innerHTML,/2026-09-08/);
  const fn=runInNewContext(code+'\n(all)=>{renderHistoryDateRail(all);return historyExactDate;}',context);
  assert.equal(fn([...model.matchSummaries.values()]),'');
});
