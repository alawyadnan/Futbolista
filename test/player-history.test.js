import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataModel } from '../data-engine.js';
import { summarizePlayerHistory } from '../insights-engine.js';
import { appRouteFor, filterMatches, parseAppRoute } from '../ux-utils.js';

const players = [{id:'a',name:'Ali'}, {id:'b',name:'Ali'}, {id:'c',name:'Bader'}];
const logs = [
  {id:'1',playerId:'a',date:'2026-08-01',goals:2,result:'win'},
  {id:'duplicate',playerId:'a',date:'2026-08-01',goals:2,result:'win'},
  {id:'own',playerId:'a',date:'2026-08-01',goals:1,ownGoal:true,result:'win'},
  {id:'b1',playerId:'b',date:'2026-08-01',goals:4,result:'loss'},
  {id:'2',playerId:'a',date:'2026-08-02',goals:1,result:'draw'},
  {id:'3',playerId:'a',date:'2026-09-01',goals:0,result:'loss'},
  {id:'c1',playerId:'c',date:'2026-09-01',goals:1,result:'win'},
  {id:'4',playerId:'b',date:'2026-09-03',goals:3,result:'win'}
];
const model = buildDataModel(players,logs);
const matches = [...model.matchSummaries.values()];
const name = id => players.find(player => player.id === id)?.name;

test('player history uses immutable ID even when two players have the same name', () => {
  assert.equal(filterMatches(matches,name,'','all','a').length,3);
  assert.equal(filterMatches(matches,name,'','all','b').length,2);
});
test('history search and date filters intersect the exact selected player', () => {
  assert.equal(filterMatches(matches,name,'Bader','month:2026-09','a').length,1);
  assert.equal(filterMatches(matches,name,'','month:2026-08','a').length,2);
  assert.equal(filterMatches(matches,name,'Bader','month:2026-08','a').length,0);
});
test('history totals count canonical appearances once and keep own goals separate', () => {
  assert.deepEqual(summarizePlayerHistory(matches,'a'), {
    matches:3,wins:1,draws:1,losses:1,goals:3,winPct:1/3,gpm:1,ownGoals:1
  });
  assert.equal(summarizePlayerHistory([...matches,...matches],'a').matches,3);
});
test('history summary covers the filtered selection, not unrelated matches', () => {
  const selected = filterMatches(matches,name,'','month:2026-08','a');
  assert.deepEqual(summarizePlayerHistory(selected,'a'), {
    matches:2,wins:1,draws:1,losses:0,goals:3,winPct:0.5,gpm:1.5,ownGoals:1
  });
});
test('empty and absent-player histories have safe zero totals', () => {
  for (const selected of [[],matches]) {
    const stats = summarizePlayerHistory(selected,'missing');
    assert.equal(Object.values(stats).every(value => value === 0),true);
  }
});
test('history analysis preserves authoritative inputs', () => {
  const before = JSON.stringify({players,logs,matches});
  summarizePlayerHistory(filterMatches(matches,name,'','all','a'),'a');
  assert.equal(JSON.stringify({players,logs,matches}),before);
});
test('same-date distinct match IDs remain separate appearances', () => {
  const twice = buildDataModel(players,[
    {...logs[0],matchId:'first'}, {...logs[0],id:'second-entry',matchId:'second'}
  ]);
  assert.equal(summarizePlayerHistory([...twice.matchSummaries.values()],'a').matches,2);
});
test('player history deep links support Unicode and reserved characters', () => {
  for (const id of ['a','لاعب','player/id','player id','player%id']) {
    assert.deepEqual(parseAppRoute(appRouteFor('history',id)),{screen:'history',playerId:'',historyPlayerId:id});
  }
  assert.equal(appRouteFor('history'),'#history');
  assert.deepEqual(parseAppRoute('#history'),{screen:'history',playerId:''});
  assert.deepEqual(parseAppRoute('#history/player/%E0%A4%A'),{screen:'dashboard',playerId:''});
});
