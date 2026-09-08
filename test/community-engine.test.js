import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataModel } from '../data-engine.js';
import { validateProfile, sessionCandidates, sessionDocumentId, votingState, validateBallot, tallyBallots, resolvePublicPlayers, VOTING_WINDOW_MS, planEntryVoting, selectVotingSession, moveVoteChoiceUp } from '../community-engine.js';
const now=1_800_000_000_000;
const session={openedAt:now-1000,candidatePlayerIds:['a','b','c','d']};
const valid={session,user:{playerId:'a'},choices:['b','c','d'],now};
test('profile normalization allows only safe presentation data, number 0–99 or null',()=>{assert.deepEqual(validateProfile({displayName:'  أحمد  علي ',preferredNumber:0}).value,{displayName:'أحمد علي',preferredNumber:0});for(const field of ['playerId','goals','wins','admin'])assert.ok(validateProfile({displayName:'A',preferredNumber:9,[field]:'bad'}).error);for(const name of ['', ' ', '<b>', '\u202Ebad','a'.repeat(41)])assert.ok(validateProfile({displayName:name,preferredNumber:null}).error);for(const value of [-1,100,1.5,'9',NaN])assert.ok(validateProfile({displayName:'A',preferredNumber:value}).error);});
test('MVP candidates reuse normalized participation and ignore absent/orphan players',()=>{const players=['a','b','c','d','absent'].map(id=>({id,name:id}));const logs=['a','b','c','d','orphan'].map(playerId=>({playerId,date:'2026-09-06',goals:1}));logs.push({...logs[0],ownGoal:true});logs.push({...logs[0]});assert.deepEqual(sessionCandidates(buildDataModel(players,logs),'2026-09-06'),['a','b','c','d']);});
test('session ids retain matchId compatibility including slash/Unicode',()=>{assert.equal(sessionDocumentId('2026-09-06'),'2026-09-06');assert.equal(sessionDocumentId('round/أ'),encodeURIComponent('round/أ'));assert.throws(()=>sessionDocumentId(''));});
test('24-hour window exact at server opening and closing boundaries',()=>{assert.equal(votingState({openedAt:now},now-1).state,'pending');assert.equal(votingState({openedAt:now},now).state,'open');assert.equal(votingState({openedAt:now},now+VOTING_WINDOW_MS-1).state,'open');assert.equal(votingState({openedAt:now},now+VOTING_WINDOW_MS).state,'closed');assert.equal(votingState({openedAt:null},now).state,'pending');});
test('ballots require approved player, unique participants and no self vote',()=>{assert.equal(validateBallot(valid),null);assert.equal(validateBallot({...valid,user:null}),'linkedRequired');assert.equal(validateBallot({...valid,choices:['b','b','d']}),'uniqueChoices');assert.equal(validateBallot({...valid,choices:['a','b','c']}),'noSelfVote');assert.equal(validateBallot({...valid,choices:['b','c','absent']}),'invalidCandidate');assert.equal(validateBallot({...valid,choices:['b','c']}),'chooseThree');});
test('ballot validation denies before opening and at deadline, allows update before',()=>{assert.equal(validateBallot({...valid,now:session.openedAt-1}),'votingClosed');assert.equal(validateBallot({...valid,now:session.openedAt+VOTING_WINDOW_MS}),'votingClosed');assert.equal(validateBallot({...valid,choices:['d','c','b']}),null);});
test('a linked account can vote only in the exact workout it participated in',()=>{
  assert.equal(validateBallot({...valid,user:{playerId:'absent'}}),'participantRequired');
  const nextWorkout={...session,date:'2026-09-08',candidatePlayerIds:['b','c','d','e']};
  assert.equal(validateBallot({...valid,session:nextWorkout}),'participantRequired');
  assert.equal(validateBallot(valid),null);
});
test('workout selection prefers participation and preserves an explicit date until closing',()=>{
  const newer={...session,id:'newer',candidatePlayerIds:['b','c','d','e']};
  const attended={...session,id:'attended'};
  assert.equal(selectVotingSession([newer,attended],'','a',now).id,'attended');
  assert.equal(selectVotingSession([newer,attended],'newer','a',now).id,'newer');
  assert.equal(selectVotingSession([newer,{...attended,openedAt:now-VOTING_WINDOW_MS}],'attended','a',now).id,'newer');
  assert.equal(selectVotingSession([attended],'','a',now+VOTING_WINDOW_MS),null);
});
test('rank controls swap choices without duplication, mutation or losing a selection',()=>{
  const choices=Object.freeze(['b','c','d']);
  assert.deepEqual(moveVoteChoiceUp(choices,1),['c','b','d']);
  assert.deepEqual(moveVoteChoiceUp(choices,2),['b','d','c']);
  assert.deepEqual(moveVoteChoiceUp(['b','','d'],2),['b','d','']);
  for(const rank of [-1,0,3,1.5])assert.deepEqual(moveVoteChoiceUp(choices,rank),choices);
  assert.deepEqual(moveVoteChoiceUp(['b','',''],1),['b','','']);
});
const ballots=[{uid:'u1',voterPlayerId:'a',firstPlayerId:'b',secondPlayerId:'c',thirdPlayerId:'d',points:1000},{uid:'u2',voterPlayerId:'b',firstPlayerId:'a',secondPlayerId:'c',thirdPlayerId:'d'}];
test('live tallies never returned; final points derive only from 5/3/1 ranks',()=>{assert.equal(tallyBallots(session,ballots,now),null);const result=tallyBallots(session,ballots,now+VOTING_WINDOW_MS);assert.deepEqual(result.ranking.map(row=>[row.playerId,row.points]),[['c',6],['a',5],['b',5],['d',2]]);assert.equal(result.totalBallots,2);});
test('duplicate UID, self/duplicate/absent choices and corrupt ballots cannot inflate score',()=>{const result=tallyBallots(session,[...ballots,ballots[0],{...ballots[0],uid:'bad',firstPlayerId:'a'},{...ballots[0],uid:'bad2',secondPlayerId:'b'}],now+VOTING_WINDOW_MS);assert.equal(result.totalBallots,2);});
test('imported or forged votes from non-participants are excluded from final totals',()=>{
  const result=tallyBallots(session,[...ballots,{...ballots[0],uid:'absent-user',voterPlayerId:'absent'}],now+VOTING_WINDOW_MS);
  assert.deepEqual(result,tallyBallots(session,ballots,now+VOTING_WINDOW_MS));
});
test('tie fallback is immutable playerId, not mutable display names or input order',()=>{const a=tallyBallots(session,ballots,now+VOTING_WINDOW_MS);const b=tallyBallots(session,[...ballots].reverse(),now+VOTING_WINDOW_MS);assert.deepEqual(a,b);assert.equal(a.ranking.findIndex(row=>row.playerId==='a')<a.ranking.findIndex(row=>row.playerId==='b'),true);});
test('equal points prioritize first-choice votes, then second-choice votes',()=>{
  const rank = selections => tallyBallots({...session,candidatePlayerIds:[...session.candidatePlayerIds,...selections.map((_,index)=>`participant-${index}`)]},selections.map((choices,index)=>({
    uid:`voter-${index}`,voterPlayerId:`participant-${index}`,
    firstPlayerId:choices[0],secondPlayerId:choices[1],thirdPlayerId:choices[2]
  })),now+VOTING_WINDOW_MS).ranking;
  const first = rank([...Array(3).fill(['a','c','d']),...Array(5).fill(['c','b','d'])]);
  assert.equal(first.find(row=>row.playerId==='a').points,15);
  assert.equal(first.find(row=>row.playerId==='b').points,15);
  assert.ok(first.findIndex(row=>row.playerId==='a') < first.findIndex(row=>row.playerId==='b'));
  const second = rank([['a','c','d'],['b','c','d'],['c','a','d'],['c','a','d'],['c','b','d'],...Array(3).fill(['c','d','b'])]);
  const a = second.find(row=>row.playerId==='a'), b = second.find(row=>row.playerId==='b');
  assert.equal(a.points,b.points);
  assert.equal(a.first,b.first);
  assert.ok(a.second > b.second);
  assert.ok(second.indexOf(a) < second.indexOf(b));
});
test('name/number overlays never mutate canonical players, logs or historical statistics',()=>{const players=['a','b'].map(id=>({id,name:id}));const logs=[{playerId:'a',date:'2026-09-06',goals:3,result:'win'}];const previous=buildDataModel(players,logs);const profiles=new Map([['a',{displayName:'New name',preferredNumber:99}]]);const changed=resolvePublicPlayers(players,profiles);assert.equal(players[0].name,'a');assert.equal(changed[0].id,'a');assert.equal(changed[0].name,'New name');assert.deepEqual(buildDataModel(changed,logs).stats,previous.stats);assert.equal(resolvePublicPlayers(players,new Map())[1].name,'b');});

const entryPlayers=['a','b','c','d'].map(id=>({id,name:id}));
const firstEntry={playerId:'a',date:'2026-09-07',goals:2,result:'win',side:'A'};
test('the first entry of a new match creates its automatic vote without browser timestamps',()=>{
  const plan=planEntryVoting(buildDataModel(entryPlayers,[]),firstEntry,null,now);
  assert.deepEqual(plan,{type:'create',value:{matchKey:'2026-09-07',date:'2026-09-07',candidatePlayerIds:['a']}});
  assert.equal('openedAt' in plan.value,false);
});
test('later participants are appended without reopening or extending the 24-hour window',()=>{
  const opening={...session,candidatePlayerIds:['a']};
  const model=buildDataModel(entryPlayers,[firstEntry]);
  const plan=planEntryVoting(model,{...firstEntry,playerId:'b'},opening,now);
  assert.deepEqual(plan,{type:'append',value:{candidatePlayerIds:['a','b']}});
  assert.equal(opening.openedAt,session.openedAt);
  assert.equal(votingState({...opening,...plan.value},now).closesAt,opening.openedAt+VOTING_WINDOW_MS);
});
test('own-goal and duplicate appearances never add a second candidate or restart voting',()=>{
  const opening={...session,candidatePlayerIds:['a']};
  const model=buildDataModel(entryPlayers,[firstEntry,{...firstEntry,ownGoal:true}]);
  assert.deepEqual(planEntryVoting(model,firstEntry,opening,now),{type:'none'});
});
test('closed voting is unchanged when statistics are entered later',()=>{
  const model=buildDataModel(entryPlayers,[firstEntry]);
  assert.deepEqual(planEntryVoting(model,{...firstEntry,playerId:'b'},session,session.openedAt+VOTING_WINDOW_MS),{type:'none'});
});
test('existing historical matches do not receive retroactive voting sessions',()=>{
  const model=buildDataModel(entryPlayers,[firstEntry]);
  assert.deepEqual(planEntryVoting(model,{...firstEntry,playerId:'b'},null,now),{type:'none'});
});
test('future matchIds distinguish two automatically opened matches on the same date',()=>{
  const model=buildDataModel(entryPlayers,[{...firstEntry,matchId:'first'}]);
  assert.equal(planEntryVoting(model,{...firstEntry,matchId:'second'},null,now).value.matchKey,'second');
  assert.throws(()=>planEntryVoting(model,{...firstEntry,playerId:'absent'}),/invalidCandidate/);
});
test('voting waits for four recorded participants before offering three non-self choices',()=>{
  assert.equal(validateBallot({...valid,session:{...session,candidatePlayerIds:['a','b','c']}}),'sessionTooSmall');
});
test('Firestore timestamp shapes preserve exactly 24 hours across calendar dates',()=>{
  const millis=Date.UTC(2026,8,7,23,45,0,250);
  for (const openedAt of [{seconds:Math.floor(millis/1000),nanoseconds:250000000},{toMillis:()=>millis}]) {
    assert.equal(votingState({openedAt},millis).remaining,VOTING_WINDOW_MS);
    assert.equal(votingState({openedAt},millis+VOTING_WINDOW_MS-1).state,'open');
    assert.equal(votingState({openedAt},millis+VOTING_WINDOW_MS).state,'closed');
  }
});
test('candidate planning is immutable and keeps the original window on repeated saves',()=>{
  const opening=Object.freeze({...session,candidatePlayerIds:Object.freeze(['a'])});
  const entry=Object.freeze({...firstEntry,playerId:'c'});
  const model=buildDataModel(entryPlayers,[firstEntry,{...firstEntry,playerId:'b'}]);
  const plan=planEntryVoting(model,entry,opening,now);
  assert.deepEqual(plan.value,{candidatePlayerIds:['a','b','c']});
  assert.deepEqual(opening.candidatePlayerIds,['a']);
  const appended={...opening,...plan.value};
  assert.deepEqual(planEntryVoting(model,entry,appended,now+60000),{type:'none'});
  assert.equal(votingState(appended).closesAt,opening.openedAt+VOTING_WINDOW_MS);
});
test('candidate planning never changes a pending or expired server-timed session',()=>{
  const model=buildDataModel(entryPlayers,[firstEntry]);
  for(const openedAt of [null,now+1000,now-VOTING_WINDOW_MS]) {
    assert.deepEqual(planEntryVoting(model,{...firstEntry,playerId:'b'},{openedAt,candidatePlayerIds:['a']},now),{type:'none'});
  }
});
test('candidate limits fail explicitly instead of silently dropping participants',()=>{
  const players=Array.from({length:101},(_,i)=>({id:`p${i}`,name:`Player ${i}`}));
  const opening={openedAt:now-1000,candidatePlayerIds:players.slice(0,100).map(p=>p.id)};
  assert.throws(()=>planEntryVoting(buildDataModel(players,[]),{...firstEntry,playerId:'p100'},opening,now),/sessionTooLarge/);
  assert.equal(opening.candidatePlayerIds.length,100);
});
