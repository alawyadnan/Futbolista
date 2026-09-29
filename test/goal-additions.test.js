import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildDataModel, calculateMonthScores, computeHeadToHead, computeTeammates, goalAdditionSide,
  isGoalAddition, prepareGoalAddition, validateGoalAdditionSave} from '../data-engine.js';
import {computeComparisonWindow, computePlayerProgress, summarizePlayerHistory} from '../insights-engine.js';
import {computeTrends, summarizeAwards} from '../highlights-engine.js';
import {buildAwardStatistics} from '../award-statistics.js';
import {sessionCandidates, tallyBallots, VOTING_WINDOW_MS} from '../community-engine.js';
import {translate, countText} from '../i18n.js';

const players=['a','b','c','d'].map(id=>({id,name:id==='a'?'Ali <script>':id}));
const date='2026-08-01';
const entry=(playerId='a',side='A',result='win',goals=2,extra={})=>({id:playerId,playerId,side,result,goals,date,createdAt:1,...extra});
const addition=(extra={})=>entry('a','A','win',1,{id:'extra',createdAt:20,goalAddition:{side:'B'},...extra});
const build=(...logs)=>buildDataModel(players,logs);

test('additional goals keep one appearance and the exact result/team chosen by the admin',()=>{
  for(const result of ['win','draw','loss']){
    const model=build(entry('a','A',result),addition({result})), part=model.byPlayer.get('a')[0];
    assert.deepEqual([model.stats.a.matches,model.stats.a.goals,part.side,part.result],[1,3,'A',result]);
    assert.equal(model.stats.a.wins,result==='win'?1:0);assert.equal(model.stats.a.draws,result==='draw'?1:0);assert.equal(model.stats.a.losses,result==='loss'?1:0);
    assert.equal(part.createdAt,1);assert.equal(part.conflicts.length,0);
  }
});
test('scoring-side allocation changes team goals without changing participant lists',()=>{
  const model=build(entry(),entry('b','B','loss',1),addition()), match=model.matchSummaries.get(date);
  assert.deepEqual([match.scoreA,match.scoreB],[2,2]);
  assert.deepEqual(match.teamA.map(p=>p.playerId),['a']);assert.deepEqual(match.teamB.map(p=>p.playerId),['b']);
  assert.deepEqual(match.scorersA.map(p=>[p.playerId,p.normalGoals,p.goalsOnly]),[['a',2,false]]);
  assert.deepEqual(match.scorersB.map(p=>[p.playerId,p.normalGoals,!!p.goalsOnly]),[['a',1,true],['b',1,false]]);
  assert.equal(match.parts.length,2);
});
test('same-side additions merge into one scorer line and add to personal goals',()=>{
  const model=build(entry(),addition({goalAddition:{side:'A'}})), match=model.matchSummaries.get(date);
  assert.equal(match.scoreA,3);assert.equal(match.scoreB,0);assert.equal(match.scorersA.length,1);assert.equal(match.scorersB.length,0);
});
test('own-goal additions belong to the opposing score and never to personal goals',()=>{
  const model=build(entry(),addition({ownGoal:true,goals:2})), match=model.matchSummaries.get(date);
  assert.deepEqual([match.scoreA,match.scoreB],[4,0]);assert.equal(model.stats.a.goals,2);
  assert.equal(model.byPlayer.get('a')[0].ownGoals,2);assert.equal(match.scorersB[0].ownGoals,2);
});
test('replaying a goal-addition document counts once; separate documents are additive',()=>{
  const one=addition(), two=addition({id:'extra2'});
  assert.equal(build(entry(),one,one).stats.a.goals,3);
  assert.equal(build(entry(),one,two).stats.a.goals,4);
  assert.deepEqual(build(two,entry(),one).stats,build(entry(),one,two).stats);
});
test('goal-only rows cannot create appearances, eligibility or voting candidates',()=>{
  const model=build(addition());
  assert.equal(model.totalMatches,0);assert.equal(model.stats.a.matches,0);assert.equal(model.eligibleIds.has('a'),false);
  assert.deepEqual(sessionCandidates(model,date),[]);
});
test('malformed markers and unidentified additions cannot be mistaken for a base appearance',()=>{
  for(const log of [addition({goalAddition:null}),addition({goalAddition:{side:'C'}}),addition({goals:-1}),addition({goals:0}),addition({goals:1.5}),addition({goals:100}),addition({id:''})]){
    assert.equal(build(entry(),log).stats.a.goals,2);assert.equal(build(log).stats.a.matches,0);
  }
});
test('additional rows cannot override appearance metadata even when a stale result is stored',()=>{
  const model=build(entry(),addition({side:'B',result:'loss',createdAt:9999}));
  assert.equal(model.stats.a.wins,1);assert.deepEqual(model.forms.a.formResults,['win']);
  assert.equal(model.byPlayer.get('a')[0].side,'A');assert.equal(model.byPlayer.get('a')[0].conflicts.length,0);
});
test('legacy conflicting and duplicate records retain the old max-goals/latest-result policy',()=>{
  const logs=[entry(),entry('a','B','loss',1,{id:'later',createdAt:2})];
  const part=build(...logs).byPlayer.get('a')[0];
  assert.deepEqual([part.normalGoals,part.side,part.result,part.conflicts.length],[2,'B','loss',1]);
  assert.equal(part.additionalGoalsBySide,undefined);
});
test('each separate match ID remains isolated even on the same date',()=>{
  const one=entry('a','A','win',2,{matchId:'one'}),two=entry('a','B','loss',1,{id:'a2',matchId:'two'});
  const model=build(one,two,addition({matchId:'one'}));
  assert.equal(model.stats.a.matches,2);assert.equal(model.matchSummaries.get('one').scoreB,1);assert.equal(model.matchSummaries.get('two').scoreB,1);
});
test('history, comparison and progress use combined goals with unchanged W/D/L totals',()=>{
  const model=build(entry(),addition()), values=[computeComparisonWindow(model,'a'),computePlayerProgress(model,'a').current,summarizePlayerHistory([...model.matchSummaries.values()],'a')];
  for(const row of values)for(const key of ['matches','goals','wins','draws','losses','winPct','gpm'])assert.equal(row[key],model.stats.a[key]);
});
test('teammates, head-to-head and streaks continue to follow the chosen participation team',()=>{
  const base=[entry(),entry('b','B','loss',0)],model=build(...base,addition());
  assert.deepEqual(computeHeadToHead(model,'a','b'),computeHeadToHead(build(...base),'a','b'));
  assert.deepEqual(computeTeammates(model,'a'),{});assert.equal(model.stats.a.current,1);
  const logs=Array.from({length:5},(_,i)=>entry('a','A','win',2,{id:`a${i}`,date:`2026-08-0${i+1}`}));
  assert.ok(computeTrends(build(...logs,addition())).some(trend=>trend.type==='wins'&&trend.count===5));
});
test('monthly rating uses total personal goals and the original team result once',()=>{
  const model=build(entry(),addition());
  const row=calculateMonthScores(model,'2026-08')[0];
  // 0.5 appearance + 0.3 goals + 1 win + 0.8 conceded <=3.
  assert.equal(row.score,2.6);assert.equal(row.matches,1);assert.equal(row.wins,1);assert.equal(row.goals,3);
});
test('goal additions neither duplicate nor halve MOTM ballot points and awards',()=>{
  const openedAt=Date.UTC(2026,7,1), logs=players.map(player=>entry(player.id));
  const session={id:date,matchKey:date,date,openedAt,candidatePlayerIds:players.map(p=>p.id)};
  const result=tallyBallots(session,[{uid:'review-voter',voterPlayerId:'b',firstPlayerId:'a',secondPlayerId:'c',thirdPlayerId:'d'}],openedAt+VOTING_WINDOW_MS+1);
  const awards=summarizeAwards([session],new Map([[date,result]]),openedAt+VOTING_WINDOW_MS+1);
  const before=buildAwardStatistics(build(...logs),awards,'2026-09'),after=buildAwardStatistics(build(...logs,addition()),awards,'2026-09');
  assert.equal(after.get('a').votingPoints,5);assert.equal(after.get('a').motmAwards,1);
  assert.equal(after.get('a').scoredMatches,before.get('a').scoredMatches);
  assert.deepEqual(sessionCandidates(build(...logs,addition()),date),session.candidatePlayerIds);
});
test('entry preparation accepts only existing participants and keeps explicit match IDs',()=>{
  const source=entry('a','A','win',2,{matchId:'fixture'}),model=build(source);
  const prepared=prepareGoalAddition(model,[source],{matchKey:'fixture',playerId:'a',goals:'3',side:'B'});
  assert.equal(prepared.sourceId,'a');assert.deepEqual(prepared.entry,{playerId:'a',date,goals:3,ownGoal:false,side:'A',result:'win',matchId:'fixture',goalAddition:{side:'B'}});
  for(const goals of ['',0,-1,1.5,100,NaN,Infinity])assert.throws(()=>prepareGoalAddition(model,[source],{matchKey:'fixture',playerId:'a',goals,side:'A'}),/invalidAdditionalGoals/);
  assert.throws(()=>prepareGoalAddition(model,[source],{matchKey:'fixture',playerId:'b',goals:1,side:'A'}),/additionalNeedsAppearance/);
  assert.throws(()=>prepareGoalAddition(model,[source],{matchKey:'fixture',playerId:'a',goals:1,side:''}),/chooseGoalTeam/);
});
test('transaction validation is idempotent and never overwrites another saved addition',()=>{
  const source=entry(),value=addition();delete value.id;
  assert.equal(validateGoalAdditionSave(source,value),'create');assert.equal(validateGoalAdditionSave(source,value,{...value}),'saved');
  assert.throws(()=>validateGoalAdditionSave(source,value,{...value,goals:2}),/additionalSaveConflict/);
  assert.throws(()=>validateGoalAdditionSave(null,value),/additionalNeedsAppearance/);
  assert.throws(()=>validateGoalAdditionSave({...source,result:'loss'},value),/additionalNeedsAppearance/);
  assert.throws(()=>validateGoalAdditionSave(addition(),value),/additionalNeedsAppearance/);
});
test('all side/type combinations conserve goals without mutating input records',()=>{
  for(const side of ['A','B'])for(const target of ['A','B'])for(const ownGoal of [false,true]){
    const logs=[entry('a',side),addition({goals:3,ownGoal,goalAddition:{side:target}})],before=JSON.stringify(logs);
    const model=build(...logs),match=model.matchSummaries.get(date);
    assert.equal(match.scoreA+match.scoreB,5);assert.equal(model.stats.a.goals,ownGoal?2:5);
    assert.equal(JSON.stringify(logs),before);assert.equal(model.stats.a.matches,1);assert.equal(model.stats.a.wins,1);
  }
});

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('actual scorer renderer shows extra goals on the other team as goals only, without unsafe markup',()=>{
  const code=source.slice(source.indexOf('function sideLines('),source.indexOf('function renderPlayersAdmin('));
  const entries=build(entry(),addition()).matchSummaries.get(date).scorersB;
  for(const language of ['ar','en']){
    const html=runInNewContext(code+'\nsideLines(entries)',{entries,language,countText,esc,t:k=>translate(language,k),playerName:()=>players[0].name});
    assert.match(html,/goals-only-tag/);assert.match(html,/Ali &lt;script&gt;/);assert.ok(html.includes(translate(language,'goalsOnly')));
    assert.equal((html.match(/data-open-player=/g)||[]).length,1);
  }
});

function saveHarness({admin=true,failAfterCommit=false}={}){
  const original=entry(),model=build(original),storage=new Map([['a',original]]),notices=[];
  let writes=0,attempts=0,sequence=0;
  const nodes=Object.fromEntries(Object.entries({extraGoalMatch:date,extraGoalPlayer:'a',extraGoalCount:'1',extraGoalSide:'B',extraGoalType:'normal'}).map(([id,value])=>[id,{value}]));
  const code=source.slice(source.indexOf('async function addGoalsSafely('),source.indexOf('/* =========================================================\n   FIREBASE ERROR'));
  const save=runInNewContext('let addGoalsBusy=false,goalAdditionRequest=null;\n'+code+'\naddGoalsSafely',{
    $:id=>nodes[id],isAdmin:admin,isDataReady:()=>true,model,rawLogs:[original],prepareGoalAddition,validateGoalAdditionSave,
    db:{},logsRef:{},doc:(_ref,id)=>id||`extra-${++sequence}`,updateGoalAdditionState(){},notify:(message)=>notices.push(message),t:k=>k,console:{error(){}},
    async runTransaction(_db,callback){attempts++;await callback({get:async ref=>({exists:()=>storage.has(ref),data:()=>storage.get(ref)}),set(ref,value){writes++;storage.set(ref,value);}});if(failAfterCommit&&attempts===1)throw new Error('uncertain response');}
  });
  return {save,storage,notices,nodes,get writes(){return writes;},get attempts(){return attempts;}};
}
test('actual admin save handler ignores double clicks while busy and never touches the base document',async()=>{
  const h=saveHarness();await Promise.all([h.save(),h.save()]);assert.equal(h.writes,1);assert.equal(h.attempts,1);assert.deepEqual(h.storage.get('a'),entry());
});
test('retry after an uncertain committed response reuses the document and adds no extra goals',async()=>{
  const h=saveHarness({failAfterCommit:true});await h.save();await h.save();assert.equal(h.attempts,2);assert.equal(h.writes,1);assert.equal(h.storage.size,2);
  assert.equal(build(...[...h.storage].map(([id,value])=>({...value,id}))).stats.a.goals,3);
});
test('actual save handler denies public users before any persistence operation',async()=>{
  const h=saveHarness({admin:false});await h.save();assert.equal(h.attempts,0);assert.deepEqual(h.notices,['adminRequired']);
});
test('goal addition path never writes voting documents or changes the voting clock',()=>{
  const code=source.slice(source.indexOf('async function addGoalsSafely('),source.indexOf('/* =========================================================\n   FIREBASE ERROR'));
  assert.doesNotMatch(code,/sessionVotes|saveMatchEntry|openedAt|ballots/);assert.match(code,/validateGoalAdditionSave/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<details class="card additional-goals-card" data-admin="1">/);
});
test('cancelled split-result feature is absent from source and all labels are bilingual',()=>{
  for(const file of ['app.js','data-engine.js','insights-engine.js','index.html','i18n.js'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/playedBothTeams|teamSplit|resultWeights|half win|نصف فوز/);
  for(const language of ['ar','en'])for(const key of ['additionalGoals','additionalGoalsHint','additionalKeepsResult','additionalGoalTeam','additionalGoalCount','additionalNeedsAppearance','additionalGoalsSaved'])assert.notEqual(translate(language,key),key);
  assert.ok(isGoalAddition(addition()));assert.equal(goalAdditionSide(addition()),'B');
});
