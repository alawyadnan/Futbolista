import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDataModel} from '../data-engine.js';
import {filterPlayerMatchPerformance} from '../insights-engine.js';
import {filterMatches,filterRankingRows} from '../ux-utils.js';
import {rankAwardRows} from '../award-statistics.js';
import {renderRankingPodium,renderAwardComparison} from '../sports-ui.js';
import {translate} from '../i18n.js';

const players = [{id:'a',name:'Ali <script>'},{id:'b',name:'Ali <script>'}];
const entry = (id,playerId,date,result,goals,extra={}) => ({id,playerId,date,result,goals,...extra});
const logs = [entry('a1','a','2026-09-01','win',2),entry('dup','a','2026-09-01','win',2),entry('own','a','2026-09-01','win',8,{ownGoal:true}),
  entry('b1','b','2026-09-01','loss',9),entry('a2','a','2026-09-02','draw',0),entry('a3','a','2026-10-01','loss',3)];
const model = buildDataModel(players,logs), matches = [...model.matchSummaries.values()];
test('player filters use recorded personal results and goals, with duplicates and own goals excluded',()=>{
  const filter=key=>filterPlayerMatchPerformance(matches,'a',key).map(row=>row.matchKey);
  assert.deepEqual(filter('win'),['2026-09-01']);
  assert.deepEqual(filter('draw'),['2026-09-02']);
  assert.deepEqual(filter('loss'),['2026-10-01']);
  assert.deepEqual(filter('scored'),['2026-09-01','2026-10-01']);
  assert.deepEqual(filter('hatTrick'),['2026-10-01']);
  assert.equal(filterPlayerMatchPerformance(matches,'b','hatTrick').length,1);
  assert.deepEqual(filterPlayerMatchPerformance(matches,'missing','win'),[]);
});
test('date selection intersects performance before pagination and never changes authoritative input',()=>{
  const before=JSON.stringify({players,logs,matches});
  const month=filterMatches(matches,()=>'', '', 'month:2026-09','a');
  assert.equal(filterPlayerMatchPerformance(month,'a','scored').length,1);
  assert.equal(filterPlayerMatchPerformance(month,'a','hatTrick').length,0);
  assert.equal(filterPlayerMatchPerformance(matches,'','win'),matches);
  assert.equal(filterPlayerMatchPerformance(matches,'a','invalid'),matches);
  assert.equal(JSON.stringify({players,logs,matches}),before);
});
test('podium keeps every earned tie through rank three, with safe names and no awards for zero totals',()=>{
  const rows=rankAwardRows(Array.from({length:5},(_,i)=>({id:String(i),name:players[0].name,votingPoints:i===4?0:10})), 'votingPoints');
  for(const language of ['ar','en']) {
    const html=renderRankingPodium(filterRankingRows(rows),'votingPoints',language);
    assert.equal((html.match(/data-open-player=/g)||[]).length,4);
    assert.equal((html.match(/podium-player podium-featured/g)||[]).length,4);
    assert.match(html,/Ali &lt;script&gt;/);assert.doesNotMatch(html,/<script>|NaN|undefined/);
    assert.doesNotMatch(html,/data-open-player="4"/);
    assert.equal(renderRankingPodium([{votingPoints:0}], 'votingPoints',language),'');
  }
});
test('ordinary podium reads the existing sorted values and does not re-rank or mutate them',()=>{
  const rows=filterRankingRows([{id:'b',name:'Bader',winPct:.8},{id:'a',name:'Ali',winPct:.6}]);
  const before=JSON.stringify(rows), html=renderRankingPodium(rows,'winPct');
  assert.ok(html.indexOf('Bader')<html.indexOf('Ali'));assert.match(html,/>80%<\/strong>/);
  assert.equal(JSON.stringify(rows),before);
});
test('award comparison distinguishes unavailable vote totals from independent monthly awards',()=>{
  const byPlayer=new Map([['a',{votingPoints:25,motmAwards:2,monthAwards:1}],['b',{votingPoints:7,motmAwards:0,monthAwards:0}]]);
  const before=JSON.stringify([...byPlayer]);
  for(const language of ['ar','en']) {
    const pending=renderAwardComparison({byPlayer,complete:false},'a','b',language);
    assert.equal((pending.match(/>—<\/strong>/g)||[]).length,4);
    assert.ok(pending.includes(translate(language,'loadingMvp')));
    assert.doesNotMatch(pending,/>25<\/strong>/);
    const ready=renderAwardComparison({byPlayer,complete:true},'a','b',language);
    assert.match(ready,/>25<\/strong>/);
    const fills=[...ready.matchAll(/--fill:([\d.]+)%/g)].map(match=>Number(match[1]));
    assert.ok(Math.abs(fills[1]-28)<0.0001);
    assert.doesNotMatch(ready,/NaN|Infinity|undefined|>—<\/strong>/);
    assert.ok(renderAwardComparison({byPlayer,complete:false,error:true},'a','b',language).includes(translate(language,'awardLoadError')));
  }
  assert.equal(renderAwardComparison(undefined,'a','b'),'');
  assert.equal(renderAwardComparison({byPlayer},'a','missing'),'');
  assert.equal(JSON.stringify([...byPlayer]),before);
});
