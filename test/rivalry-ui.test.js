import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataModel, computeHeadToHead } from '../data-engine.js';
import { computeParticipationWindow, computeDuelScoring } from '../insights-engine.js';
import { toggleComparisonPick, renderComparisonPicker, renderParticipationWindow, renderDuelRecord } from '../detail-ui.js';
import { translate } from '../i18n.js';

const players = [{id:'a',name:'Ali <img>'},{id:'b',name:'Bader'},{id:'c',name:'Cameron'},{id:'d',name:'New player'}];
const entry = (id,playerId,date,matchId,side,result,goals=0,more={}) => ({id,playerId,date,matchId,side,result,goals,...more});
const logs = [
  entry('old','b','2026-08-01','before','A','win',9),
  entry('a1','a','2026-09-01','m1','A','win',2),entry('b1','b','2026-09-01','m1','B','loss',1),
  entry('a1-dup','a','2026-09-01','m1','A','win',2),entry('a1-own','a','2026-09-01','m1','A','win',1,{ownGoal:true}),
  entry('a1-extra','a','2026-09-01','m1','A','win',3,{goalAddition:{side:'B'}}),
  entry('b2','b','2026-09-02','m2','A','win',5),
  entry('a3','a','2026-09-03','m3','B','loss',0),entry('b3','b','2026-09-03','m3','A','win',2),
  entry('a4','a','2026-09-04','m4','A','draw',1),entry('b4','b','2026-09-04','m4','A','draw',4),
  entry('b5','b','2026-09-05','m5','A','win',1)
];
const model = buildDataModel(players,logs);

test('comparison selection uses IDs, stays ordered, and does not mutate its input',()=>{
  const selected=['a'];
  assert.deepEqual(toggleComparisonPick(selected,'b',players),['a','b']);
  assert.deepEqual(selected,['a']);
  assert.deepEqual(toggleComparisonPick(['a','b'],'a',players),['b']);
  assert.deepEqual(toggleComparisonPick(['a','a','missing'],'b',players),['a','b']);
});
test('a third selection cannot silently replace a selected player or select an unknown ID',()=>{
  assert.deepEqual(toggleComparisonPick(['a','b'],'c',players),['a','b']);
  assert.deepEqual(toggleComparisonPick(['a'],'unknown',players),['a']);
  assert.deepEqual(toggleComparisonPick(['deleted'],'a',players),['a']);
});
test('comparison picker escapes names and enables compare only for two existing players',()=>{
  for(const language of ['ar','en']) {
    const one=renderComparisonPicker(['a'],players,language),two=renderComparisonPicker(['a','b'],players,language);
    assert.match(one,/Ali &lt;img&gt;/); assert.doesNotMatch(one,/<img>/);
    assert.match(one,/data-compare-picked disabled/); assert.doesNotMatch(two,/data-compare-picked disabled/);
    assert.ok(one.includes(translate(language,'pickSecondPlayer')));
    assert.match(two,/data-remove-compare="a"/);
    assert.match(renderComparisonPicker(['a','missing'],players,language),/data-compare-picked disabled/);
  }
});
test('participation starts at the first recorded appearance, not before registration is known',()=>{
  const result=computeParticipationWindow(model,'a');
  assert.deepEqual(result.matches.map(m=>m.matchKey),['m1','m2','m3','m4','m5']);
  assert.equal(result.total,5);assert.equal(result.played,3);
  assert.deepEqual(computeParticipationWindow(model,'d'),{matches:[],played:0,total:0});
  assert.equal(computeParticipationWindow(model,'missing').total,0);
});
test('non-participation is not a loss and goal additions never become extra appearances',()=>{
  const result=computeParticipationWindow(model,'a');
  assert.deepEqual(result.matches[1],{matchKey:'m2',date:'2026-09-02',played:false,result:null,goals:null});
  assert.equal(result.matches[0].goals,5);assert.equal(result.matches[0].result,'win');
  assert.equal(result.matches[2].goals,0);assert.equal(result.matches[2].result,'loss');
});
test('participation keeps distinct same-day match IDs and deterministic chronology',()=>{
  const extra=buildDataModel(players,[...logs,entry('later','b','2026-09-03','m3b','A','win',1,{createdAt:20})]);
  const keys=computeParticipationWindow(extra,'a').matches.map(m=>m.matchKey);
  assert.deepEqual(keys,['m1','m2','m3','m3b','m4','m5']);
  const reordered={...extra,matchSummaries:new Map([...extra.matchSummaries].reverse())};
  assert.deepEqual(computeParticipationWindow(reordered,'a'),computeParticipationWindow(extra,'a'));
});
test('participation window limits to recent group matches, including after the player last attended',()=>{
  const result=computeParticipationWindow(model,'a',2);
  assert.deepEqual(result.matches.map(m=>m.matchKey),['m4','m5']);assert.equal(result.played,1);
  for(const limit of [0,-1,NaN,Infinity,'2'])assert.equal(computeParticipationWindow(model,'a',limit).total,5);
  assert.equal(computeParticipationWindow(undefined,'a').total,0);
});
test('rivalry scoring covers only opponent meetings, not same-side or unrelated appearances',()=>{
  assert.deepEqual(computeDuelScoring(model,'a','b'),{aGoals:5,bGoals:3});
  assert.deepEqual(computeDuelScoring(model,'b','a'),{aGoals:3,bGoals:5});
  assert.deepEqual(computeDuelScoring(model,'a','a'),{aGoals:0,bGoals:0});
  assert.deepEqual(computeDuelScoring(model,'a','unknown'),{aGoals:0,bGoals:0});
});
test('participation and rivalry analysis do not modify records, statistics or scoring allocations',()=>{
  const before=JSON.stringify({players,logs,parts:[...model.byPlayer],matches:[...model.matchSummaries],stats:model.stats});
  computeParticipationWindow(model,'a');computeDuelScoring(model,'a','b');
  assert.equal(JSON.stringify({players,logs,parts:[...model.byPlayer],matches:[...model.matchSummaries],stats:model.stats}),before);
});
test('participation calendar links every match and labels no-shows separately in both languages',()=>{
  for(const language of ['ar','en']) {
    const html=renderParticipationWindow(model,'a',language,date=>date);
    assert.equal((html.match(/data-open-match=/g)||[]).length,5);
    assert.equal((html.match(/class="participation-cell not-played"/g)||[]).length,2);
    assert.ok(html.includes(translate(language,'didNotPlay')));
    assert.match(html,/2026-09-01/); assert.doesNotMatch(html,/NaN|undefined|Infinity/);
    assert.equal(renderParticipationWindow(model,'d',language,date=>date),'');
  }
});
test('duel presentation retains authoritative result counts, names, and personal goal totals',()=>{
  for(const language of ['ar','en']) {
    const h2h=computeHeadToHead(model,'a','b');
    const html=renderDuelRecord(model,players[0],players[1],h2h,language);
    assert.match(html,/Ali &lt;img&gt;/);assert.match(html,/duel-goals"><b>5<\/b>/);
    assert.match(html,/flex-grow:1/);assert.match(html,/flex-grow:0/);
    assert.ok(html.includes(translate(language,'duelPersonalGoals')));
    assert.ok(html.includes(translate(language,'allTime')));
    assert.doesNotMatch(html,/NaN|Infinity|undefined|<img>/);
  }
});
test('no shared match is not shown as an invented scoreless match',()=>{
  for(const language of ['ar','en']) {
    const html=renderDuelRecord(model,players[0],players[2],computeHeadToHead(model,'a','c'),language);
    assert.ok(html.includes(translate(language,'noAgainstMatches')));
    assert.doesNotMatch(html,/duel-scoreboard|duel-track|duel-goals/);
  }
});
