import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildDataModel, calculateMonthScores } from '../data-engine.js';
import { tallyBallots, VOTING_WINDOW_MS } from '../community-engine.js';
import { summarizeAwards } from '../highlights-engine.js';
import { AWARD_SORT_KEYS, buildAwardStatistics, rankAwardRows } from '../award-statistics.js';

const now = Date.UTC(2026,8,9);
const players = ['a','b','c','d'].map(id => ({id,name:id}));
const model = () => buildDataModel(players, ['2026-07-01','2026-08-01','2026-09-01','2026-10-01'].flatMap((date,i) =>
  players.map((p,j) => ({id:`${i}-${j}`,playerId:p.id,date,side:j<2?'A':'B',result:j<2?'win':'loss',goals:j===0?2:0}))));
function archive() {
  const sessions = ['2026-07-01','2026-08-01'].map(date => ({id:date,date,matchKey:date,openedAt:now-VOTING_WINDOW_MS-1,candidatePlayerIds:players.map(p=>p.id)}));
  const ballots = [{uid:'voter',voterPlayerId:'d',firstPlayerId:'a',secondPlayerId:'b',thirdPlayerId:'c'}];
  return {sessions,results:new Map(sessions.map(s=>[s.id,tallyBallots(s,ballots,now)]))};
}
const summarize = a => summarizeAwards(a.sessions,a.results,now);
test('authentication and archive callbacks may arrive before the football model',()=>{
  assert.equal(buildAwardStatistics({},summarizeAwards(),'2026-09').size,0);
});
test('all-time points aggregate 5/3/1 choices, not just MOTM wins',()=>{
  const stats=buildAwardStatistics(model(),summarize(archive()),'2026-09');
  assert.equal(stats.get('a').votingPoints,10); assert.equal(stats.get('a').motmAwards,2);
  assert.equal(stats.get('b').votingPoints,6); assert.equal(stats.get('b').motmAwards,0);
  assert.equal(stats.get('c').votingPoints,2); assert.equal(stats.get('d').votingPoints,0);
  assert.equal(stats.get('b').secondChoices,2);assert.equal(stats.get('a').scoredMatches,2);
  for (const row of stats.values()) assert.equal(row.votingPoints,row.firstChoices*5+row.secondChoices*3+row.thirdChoices);
});
test('open votes, duplicate sessions, self votes and duplicate voter UIDs cannot inflate points',()=>{
  const a=archive(),s=a.sessions[0];
  const ballot={uid:'u',voterPlayerId:'d',firstPlayerId:'a',secondPlayerId:'b',thirdPlayerId:'c'};
  a.results.set(s.id,tallyBallots(s,[ballot,ballot,{...ballot,uid:'self',voterPlayerId:'a'}],now));
  a.sessions.push({...s,id:'duplicate'}, {...s,id:'open',matchKey:'open',openedAt:now-1});
  a.results.set('duplicate',a.results.get(s.id));a.results.set('open',a.results.get(s.id));
  assert.equal(buildAwardStatistics(model(),summarize(a),'2026-09').get('a').votingPoints,10);
});
test('incomplete tallies remain marked incomplete and empty final tallies award no points',()=>{
  const a=archive();a.results.delete(a.sessions[0].id);
  assert.equal(summarize(a).complete,false);
  a.results.set(a.sessions[0].id,{totalBallots:0,ranking:[]});
  const awards=summarize(a);assert.equal(awards.complete,true);
  assert.equal(buildAwardStatistics(model(),awards,'2026-09').get('a').votingPoints,5);
});
test('monthly award history exactly follows existing scores, not voting points',()=>{
  const m=model(),stats=buildAwardStatistics(m,summarize(archive()),'2026-09');
  for(const month of ['2026-07','2026-08']) {
    const winner=calculateMonthScores(m,month,id=>m.playerById.get(id).name)[0];
    assert.ok(stats.get(winner.playerId).months.some(row=>row.month===month && row.score===winner.score));
  }
  assert.equal(stats.get('a').monthAwards,2); assert.deepEqual(stats.get('a').months.map(r=>r.month),['2026-07','2026-08']);
  assert.equal(stats.get('b').monthAwards,0);
});
test('current/future months are not earned awards; year rollover works',()=>{
  const stats=buildAwardStatistics(model(),summarize(archive()),'2026-08');
  assert.equal(stats.get('a').monthAwards,1);
  assert.equal(buildAwardStatistics(model(),summarize(archive()),'2027-01').get('a').monthAwards,4);
  assert.equal(buildAwardStatistics(model(),summarize(archive()),'bad').get('a').monthAwards,0);
});
test('empty or ineligible monthly rows do not invent monthly winners',()=>{
  const m=model();m.eligibleIds.clear();
  assert.ok([...buildAwardStatistics(m,summarize(archive()),'2027-01').values()].every(r=>r.monthAwards===0));
});
test('monthly counts preserve the existing display-name fallback in a complete score tie',()=>{
  const m=buildDataModel([{id:'a',name:''},{id:'b',name:'A'}],['a','b'].map(playerId=>({id:playerId,playerId,date:'2026-08-01',side:'A',result:'win',goals:0})));
  const name=id=>m.playerById.get(id).name || 'Unknown';
  const winner=calculateMonthScores(m,'2026-08',name)[0].playerId;
  assert.equal(winner,'b');
  assert.equal(buildAwardStatistics(m,summarizeAwards(),'2026-09',name).get(winner).monthAwards,1);
});
test('shared MOTM wins count for both players while equal point totals share ranking',()=>{
  const a=archive(),r=a.results.get(a.sessions[0].id);r.ranking[1]={...r.ranking[0],playerId:'b'};
  const stats=buildAwardStatistics(model(),summarize(a),'2026-09');
  assert.equal(stats.get('a').motmAwards,2);assert.equal(stats.get('b').motmAwards,1);
  const rows=rankAwardRows([{id:'b',name:'B',votingPoints:5},{id:'a',name:'A',votingPoints:5},{id:'c',name:'C',votingPoints:1}],'votingPoints');
  assert.deepEqual(rows.map(r=>r.rank),[1,1,3]);
});
test('podium boundary ties are not silently dropped and ranking never mutates inputs',()=>{
  const rows=[9,7,5,5].map((points,i)=>({id:String(i),name:String(i),votingPoints:points}));
  const before=structuredClone(rows),ranked=rankAwardRows(rows,'votingPoints');
  assert.equal(ranked.filter(row=>row.rank<=3).length,4);assert.deepEqual(rows,before);
  assert.throws(()=>rankAwardRows(rows,'wins'),TypeError);
});
test('zero totals stay listed without an earned rank in every award sort',()=>{
  for (const key of AWARD_SORT_KEYS) {
    const rows = [{id:'z',name:'Z',[key]:0},{id:'a',name:'A',[key]:0},{id:'b',name:'B',[key]:2}];
    assert.deepEqual(rankAwardRows(rows,key).map(row=>[row.id,row.rank]),[['b',1],['a',null],['z',null]]);
    assert.ok(rankAwardRows(rows.slice(0,2),key).every(row=>row.rank===null));
  }
});
test('malformed duplicate tally rows and unknown players cannot create profile statistics',()=>{
  const a=archive(),r=a.results.get(a.sessions[0].id);r.ranking.push({...r.ranking[0]}, {...r.ranking[0],playerId:'missing'});
  const stats=buildAwardStatistics(model(),summarize(a),'2026-09');
  assert.equal(stats.get('a').votingPoints,10);assert.equal(stats.has('missing'),false);
});

function appRanking(complete=true,error=false) {
  const m=model();m.eligibleIds=new Set(['a']);
  const byPlayer=buildAwardStatistics(m,summarize(archive()),'2026-09');
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  return runInNewContext(source.slice(source.indexOf('function rankingRows('),source.indexOf('function rankingStatus('))+'\nrankingRows;',{
    communityEnabled:true,AWARD_SORT_KEYS,rankAwardRows,players,model:m,highlights:{getStatistics:()=>({byPlayer,complete,error})},
    sorter:()=>((a,b)=>b.wins-a.wins),emptyStats:()=>({})
  });
}
test('actual app ranking includes all players for awards but preserves football eligibility',()=>{
  const rows=appRanking();assert.equal(rows('wins').rows.length,1);
  assert.equal(rows('votingPoints').rows.length,4);assert.equal(rows('motmAwards').rows[0].motmAwards,2);
  assert.equal(rows('monthAwards').rows[0].monthAwards,2);
});
test('actual app waits for all closed results and allows independent monthly/football rankings',()=>{
  const rows=appRanking(false,true);
  assert.equal(rows('votingPoints').rows.length,0);assert.equal(rows('votingPoints').pending,true);assert.equal(rows('motmAwards').error,true);
  assert.equal(rows('monthAwards').rows.length,4);assert.equal(rows('wins').rows.length,1);
});

test('actual leaderboard and table show a dash, not a gold first place, for unearned awards',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  for (const awardSort of [true,false]) {
    const nodes=new Map();
    const node=id=>{if(!nodes.has(id))nodes.set(id,{value:awardSort?'motmAwards':'wins',innerHTML:'',closest:()=>null});return nodes.get(id);};
    const context={$:node,rankingRows:()=>({rows:[{id:'a',name:'A',rank:null,motmAwards:0,votingPoints:0,monthAwards:0,formResults:[]}],awardSort,complete:true}),
      communityEnabled:true,t:key=>key,esc:value=>String(value),formatFormPoints:()=>0,renderFormDots:()=>'',fmtPct:()=>0,fmt2:()=>0};
    runInNewContext(source.slice(source.indexOf('function renderLeaderboard('),source.indexOf('function renderPlayerCardsNameOnly('))+'\nrenderLeaderboard();renderTable();',context);
    assert.match(node('tableBody').innerHTML,awardSort?/<td>—<\/td>/:/<td>1<\/td>/);
    assert.match(node('leaderboardList').innerHTML,awardSort?/class="rank-badge ">—/:/class="rank-badge top">1/);
  }
});
