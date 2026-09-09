import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataModel } from '../data-engine.js';
import { VOTING_WINDOW_MS } from '../community-engine.js';
import { awardPodium, computeTrends, motmWinners, selectHeadlineTrends, selectProfileTrends, summarizeAwards, trendDocumentId } from '../highlights-engine.js';

const now = 1_900_000_000_000;
const players = ['a','b','c','d'].map(id => ({id,name:id}));
const dates = n => Array.from({length:n},(_,i) => `2026-08-${String(i+1).padStart(2,'0')}`);
function model(results, extra = () => ({})) {
  return buildDataModel(players, dates(results.length).flatMap((date,i) => players.map((player,j) => ({id:`${i}-${j}`,playerId:player.id,date,createdAt:i,side:j<2?'A':'B',result:j<2?results[i]:results[i]==='win'?'loss':results[i]==='loss'?'win':'draw',goals:1,...extra(i,j)}))));
}
const trend = (m,type,id='a',awards) => computeTrends(m,awards).find(row => row.playerId === id && row.type === type);
const final = (winner='a') => ({totalBallots:1,ranking:[{playerId:winner,points:5,first:1,second:0,third:0},{playerId:'z',points:3,first:0,second:1,third:0}]});
function archive(n, winner='a') {
  const sessions = dates(n).map((date,i) => ({id:date,matchKey:date,date,openedAt:now-VOTING_WINDOW_MS-1000+i}));
  return { sessions, results:new Map(sessions.map(s => [s.id,final(winner)])) };
}

test('three wins qualify for profile, five for headlines',()=>{
  const three = model(Array(3).fill('win'));
  assert.equal(trend(three,'wins').count,3); assert.equal(trend(three,'wins').strong,false);
  const five = model(Array(5).fill('win'));
  assert.ok(selectHeadlineTrends(computeTrends(five)).some(t=>t.playerId==='a' && t.type==='wins'));
});
test('losses require more than three consecutive losses',()=>{
  assert.equal(trend(model(Array(3).fill('loss')),'losses'),undefined);
  assert.equal(trend(model(Array(4).fill('loss')),'losses').count,4);
});
test('draw preserves unbeaten/winless runs but breaks win/loss runs',()=>{
  const m = model(['win','win','win','win','draw']);
  assert.equal(trend(m,'unbeaten').count,5); assert.equal(trend(m,'wins'),undefined);
  assert.equal(trend(model(['loss','loss','loss','loss','draw']),'winless').count,5);
});
test('scoring uses normal goals, not own goals, and requires six matches',()=>{
  assert.equal(trend(model(Array(5).fill('win')),'scoring'),undefined);
  assert.equal(trend(model(Array(6).fill('win')),'scoring').count,6);
  assert.equal(trend(model(Array(6).fill('win'),(i,j)=>i===5&&j===0?{goals:8,ownGoal:true}:{}),'scoring'),undefined);
});
test('deduplicated own goal rows do not add appearances or break valid scoring',()=>{
  const base = model(Array(10).fill('win'));
  const logs = dates(10).flatMap((date,i)=>[{id:`n${i}`,playerId:'a',date,result:'win',side:'A',goals:1},{id:`o${i}`,playerId:'a',date,result:'win',side:'A',goals:9,ownGoal:true}]);
  const m = buildDataModel(players,logs);
  assert.equal(trend(m,'attendance').count,10); assert.equal(trend(m,'scoring').count,10);
  assert.equal(base.totalMatches,m.totalMatches);
});
test('attendance counts team fixtures and resets on an absence',()=>{
  const m = model(Array(12).fill('win'));
  const logs = m.participations.filter(p=>!(p.playerId==='a'&&p.date==='2026-08-08')).map(p=>({...p,goals:1}));
  const missed = buildDataModel(players,logs);
  assert.equal(trend(missed,'attendance'),undefined);
  assert.equal(trend(missed,'wins').count,11); // form is consecutive appearances
});
test('inactive players may keep profile form but do not headline the home page',()=>{
  const m = model(Array(12).fill('win'));
  const logs = m.participations.filter(p=>!(p.playerId==='a'&&p.date==='2026-08-12')).map(p=>({...p,goals:1}));
  const inactive = buildDataModel(players,logs);
  assert.equal(trend(inactive,'wins').current,false);
  assert.ok(!selectHeadlineTrends(computeTrends(inactive)).some(t=>t.playerId==='a'));
});
test('conflicting source participation stops result streaks',()=>{
  const m = model(Array(6).fill('win'));
  m.byPlayer.get('a').at(-1).conflicts.push({result:'loss'});
  assert.equal(trend(m,'wins'),undefined); assert.equal(trend(m,'scoring'),undefined);
});
test('full ties share the award instead of using player ID as the winner',()=>{
  const result = final(); result.ranking[1]={...result.ranking[0],playerId:'b'};
  assert.deepEqual(motmWinners(result),['a','b']);
});
test('tie breakers use first/second choices and no votes means no winner',()=>{
  const result=final(); result.ranking.push({playerId:'c',points:5,first:0,second:1,third:2});
  assert.deepEqual(motmWinners(result),['a']); assert.deepEqual(motmWinners({totalBallots:0,ranking:[]}),[]);
});
test('career award total includes more than the latest ten sessions',()=>{
  const a=archive(14); const stats=summarizeAwards(a.sessions,a.results,now);
  assert.equal(stats.byPlayer.get('a').length,14); assert.equal(stats.complete,true);
});
test('open ballots never become award totals, even if a tally was supplied',()=>{
  const a=archive(1); a.sessions[0].openedAt=now-1;
  const stats=summarizeAwards(a.sessions,a.results,now);
  assert.equal(stats.byPlayer.size,0); assert.equal(stats.latest,null);
});
test('unloaded result remains unknown, not a zero award count',()=>{
  const a=archive(3); a.results.delete(a.sessions[1].id);
  const stats=summarizeAwards(a.sessions,a.results,now);
  assert.equal(stats.complete,false); assert.equal(stats.loaded,2);
  assert.equal(trend(model(Array(3).fill('win')),'motm','a',stats),undefined);
});
test('MOTM streak requires consecutive appearances with closed, non-empty results',()=>{
  const a=archive(3); const m=model(Array(3).fill('win'));
  assert.equal(trend(m,'motm','a',summarizeAwards(a.sessions,a.results,now)).count,3);
  a.results.set(a.sessions[1].id,{totalBallots:0,ranking:[]});
  assert.equal(trend(m,'motm','a',summarizeAwards(a.sessions,a.results,now)),undefined);
});
test('ongoing latest vote does not erase the preceding MOTM run',()=>{
  const a=archive(4); a.sessions[3].openedAt=now-1;
  const row=trend(model(Array(4).fill('win')),'motm','a',summarizeAwards(a.sessions,a.results,now));
  assert.equal(row.count,3); assert.equal(row.current,true);
});
test('historical match without a vote is not skipped in an MOTM run',()=>{
  const a=archive(4); a.sessions.pop(); a.results.delete('2026-08-04');
  assert.equal(trend(model(Array(4).fill('win')),'motm','a',summarizeAwards(a.sessions,a.results,now)),undefined);
});
test('display suppression persists while a run grows but not after it breaks',()=>{
  const five=trend(model(Array(5).fill('win')),'wins');
  const six=trend(model(Array(6).fill('win')),'wins');
  assert.equal(five.id,six.id);
  assert.equal(selectProfileTrends([six],'a',new Set([five.id])).length,0);
  const restarted=trend(model(['win','win','win','loss','win','win','win']),'wins');
  assert.notEqual(restarted.id,five.id);
});
test('headlines limited to three different players, without redundant profile facts',()=>{
  const m=model(Array(16).fill('win'));
  const all=computeTrends(m), headlines=selectHeadlineTrends(all);
  assert.ok(headlines.length<=3); assert.equal(new Set(headlines.map(t=>t.playerId)).size,headlines.length);
  const profile=selectProfileTrends(all,'a');
  assert.ok(profile.some(t=>t.type==='wins')); assert.ok(!profile.some(t=>t.type==='unbeaten'));
});
test('trend identity encodes delimiters, Unicode and immutable player ID safely',()=>{
  const id=trendDocumentId({playerId:'a/ب',type:'wins',startMatchKey:'m/a'});
  assert.ok(!id.includes('/')); assert.deepEqual(JSON.parse(decodeURIComponent(id)),['a/ب','wins','m/a']);
});
test('empty data has no trends or invented awards',()=>{
  assert.deepEqual(computeTrends(buildDataModel([],[])),[]);
  assert.equal(summarizeAwards().byPlayer.size,0);
});
test('hiding a winning streak does not relabel the identical run as unbeaten',()=>{
  const all=computeTrends(model(Array(10).fill('win')));
  const win=all.find(row=>row.playerId==='a'&&row.type==='wins');
  const hidden=new Set([win.id]);
  assert.ok(!selectProfileTrends(all,'a',hidden).some(row=>['wins','unbeaten'].includes(row.type)));
  assert.ok(!selectHeadlineTrends(all,hidden).some(row=>row.playerId==='a'&&row.type==='unbeaten'));
});
test('a shared first place uses joint gold positions, never a fake silver winner',()=>{
  const result=final();result.ranking=[{...result.ranking[0]},{...result.ranking[0],playerId:'b'},{...result.ranking[1],playerId:'c'}];
  assert.deepEqual(awardPodium(result).map(row=>row.rank),[1,1,3]);
});
test('dynamic trend labels are localized in both languages',async()=>{
  const {translate}=await import('../i18n.js');
  for(const type of ['wins','unbeaten','losses','winless','scoring','attendance','motm']) for(const lang of ['ar','en']) {
    assert.notEqual(translate(lang,`trend_${type}`,{count:6}),`trend_${type}`);
    assert.notEqual(translate(lang,`trendName_${type}`),`trendName_${type}`);
  }
});
test('imported duplicate session documents never duplicate an MOTM award',()=>{
  const a=archive(1),duplicate={...a.sessions[0],id:'duplicate'};
  a.sessions.push(duplicate);a.results.set(duplicate.id,final('b'));
  const summary=summarizeAwards(a.sessions,a.results,now);
  assert.equal(summary.closed.length,1);assert.equal(summary.byPlayer.get('a').length,1);assert.equal(summary.byPlayer.has('b'),false);
});
test('headlines prefer different kinds of records and at most one caution',()=>{
  const rows=selectHeadlineTrends(computeTrends(model(Array(16).fill('win'))));
  assert.equal(new Set(rows.map(row=>row.type)).size,rows.length);
  assert.ok(rows.filter(row=>row.tone==='caution').length<=1);
});
