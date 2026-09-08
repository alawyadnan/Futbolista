import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

if (process.env.FUTBOLISTA_ALLOW_EMULATOR_WRITES !== '1') throw new Error('This suite writes disposable emulator data. Explicit approval and FUTBOLISTA_ALLOW_EMULATOR_WRITES=1 are required. Use npm test for no-write tests.');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Rules tests require the loopback emulator. Production is forbidden.');
let env;
const adminToken = {email:'admin@ftbll.live',email_verified:false};
const dbFor = (uid, verified=true) => env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:verified}).firestore();
const adminDb = () => env.authenticatedContext('admin',adminToken).firestore();
const guestDb = () => env.unauthenticatedContext().firestore();
const requestData = (uid,pid) => ({requestedPlayerId:pid,email:`${uid}@example.test`,status:'pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const profileData = () => ({displayName:'Player A',preferredNumber:9,updatedAt:serverTimestamp()});
const ballotData = (pid='a') => ({voterPlayerId:pid,firstPlayerId:'b',secondPlayerId:'c',thirdPlayerId:'d',submittedAt:serverTimestamp(),updatedAt:serverTimestamp()});
const sessionData = (openedAt=serverTimestamp()) => ({matchKey:'2026-09-06',date:'2026-09-06',candidatePlayerIds:['a','b','c','d'],openedAt});
// These helpers only run after the explicit opt-in above. They MUST NOT be used
// during a no-write QA run. Legacy fixtures deliberately omit firstEntryId.
async function openWithEntry(id, {db=adminDb(), session={}, entry={}, saveEntry=true}={}) {
  const firstEntryId=`first-${id}`;
  const batch=writeBatch(db);
  if (saveEntry) batch.set(doc(db,'logs',firstEntryId),{playerId:'a',date:'2026-09-06',goals:2,result:'win',side:'A',ownGoal:false,createdAt:Date.now(),...entry});
  batch.set(doc(db,'sessionVotes',id),{...sessionData(),candidatePlayerIds:['a'],firstEntryId,...session});
  return batch.commit();
}
async function seed(fn) { await env.withSecurityRulesDisabled(context=>fn(context.firestore())); }
async function seedSession(id='open', age=0) { await seed(db=>setDoc(doc(db,'sessionVotes',id),sessionData(Timestamp.fromMillis(Date.now()-age)))); }
async function seedLink(uid='alice',pid='a') { await seed(async db=>{await setDoc(doc(db,'users',uid),{playerId:pid,createdAt:Timestamp.now()}); await setDoc(doc(db,'playerClaims',pid),{uid,createdAt:Timestamp.now()}); await setDoc(doc(db,'playerProfiles',pid),profileData());}); }
async function approval(uid,pid,db=adminDb()) {
  const batch=writeBatch(db);
  batch.set(doc(db,'users',uid),{playerId:pid,createdAt:serverTimestamp()});
  batch.set(doc(db,'playerClaims',pid),{uid,createdAt:serverTimestamp()});
  batch.set(doc(db,'playerProfiles',pid),profileData());
  batch.update(doc(db,'accountRequests',uid),{status:'approved',updatedAt:serverTimestamp()});
  return batch.commit();
}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-futbolista',firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore(); await seed(async db=>{for(const id of ['a','b','c','d','e']) await setDoc(doc(db,'players',id),{name:`Player ${id}`});});});
after(async()=>{await env?.cleanup();});

test('public football reads stay available, guests cannot write or delete',async()=>{const db=guestDb();await assertSucceeds(getDocs(collection(db,'players')));await assertSucceeds(getDocs(collection(db,'logs')));await assertFails(setDoc(doc(db,'logs','bad'),{}));await assertFails(deleteDoc(doc(db,'players','a')));});
test('normal authenticated users cannot write any football/statistics path',async()=>{const db=dbFor('alice');for(const name of ['players','logs','matches','statistics','settings'])await assertFails(setDoc(doc(db,name,'a'),{goals:100}));});
test('legacy email administrator retains football CRUD even if unverified',async()=>{const db=adminDb();await assertSucceeds(setDoc(doc(db,'logs','entry'),{goals:2}));await assertSucceeds(updateDoc(doc(db,'players','a'),{name:'Updated'}));await assertSucceeds(deleteDoc(doc(db,'logs','entry')));});
test('verified users request an existing player, not absent or another UID',async()=>{const db=dbFor('alice');await assertSucceeds(setDoc(doc(db,'accountRequests','alice'),requestData('alice','a')));await assertFails(setDoc(doc(db,'accountRequests','bob'),requestData('alice','b')));await assertFails(updateDoc(doc(db,'accountRequests','alice'),{requestedPlayerId:'missing',updatedAt:serverTimestamp()}));await assertFails(setDoc(doc(dbFor('bob',false),'accountRequests','bob'),requestData('bob','b')));});
test('normal users cannot self approve, forge email or add privileged fields',async()=>{const db=dbFor('alice');await setDoc(doc(db,'accountRequests','alice'),requestData('alice','a'));await assertFails(updateDoc(doc(db,'accountRequests','alice'),{status:'approved',updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,'accountRequests','alice'),{email:'admin@ftbll.live',updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,'accountRequests','alice'),{admin:true,updatedAt:serverTimestamp()}));});
test('private account requests/users are not public or readable by other users',async()=>{await setDoc(doc(dbFor('alice'),'accountRequests','alice'),requestData('alice','a'));await assertFails(getDoc(doc(guestDb(),'accountRequests','alice')));await assertFails(getDoc(doc(dbFor('bob'),'accountRequests','alice')));await assertFails(getDocs(collection(dbFor('alice'),'accountRequests')));await assertSucceeds(getDoc(doc(dbFor('alice'),'users','alice')));});
test('admin approval atomically links exactly one account and player',async()=>{await setDoc(doc(dbFor('alice'),'accountRequests','alice'),requestData('alice','a'));await assertSucceeds(approval('alice','a'));assert.equal((await getDoc(doc(dbFor('alice'),'users','alice'))).data().playerId,'a');await assertFails(updateDoc(doc(adminDb(),'users','alice'),{playerId:'b'}));});
test('admin cannot approve without reciprocal locks or target a different player',async()=>{await setDoc(doc(dbFor('alice'),'accountRequests','alice'),requestData('alice','a'));await assertFails(updateDoc(doc(adminDb(),'accountRequests','alice'),{status:'approved',updatedAt:serverTimestamp()}));await assertFails(approval('alice','b'));});
test('second account cannot claim a linked player; same account cannot claim two players',async()=>{await setDoc(doc(dbFor('alice'),'accountRequests','alice'),requestData('alice','a'));await approval('alice','a');await setDoc(doc(dbFor('bob'),'accountRequests','bob'),requestData('bob','a'));await assertFails(approval('bob','a'));await assertFails(updateDoc(doc(dbFor('alice'),'accountRequests','alice'),{status:'pending',requestedPlayerId:'b',updatedAt:serverTimestamp()}));});
test('rejected requests may be resubmitted but only admin may reject',async()=>{const db=dbFor('alice');await setDoc(doc(db,'accountRequests','alice'),requestData('alice','a'));await assertFails(updateDoc(doc(db,'accountRequests','alice'),{status:'rejected',updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(doc(adminDb(),'accountRequests','alice'),{status:'rejected',updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(doc(db,'accountRequests','alice'),{status:'pending',requestedPlayerId:'b',updatedAt:serverTimestamp()}));});
test('linked owner changes only safe presentation fields, not playerId/stats/another profile',async()=>{await seedLink();await seedLink('bob','b');const db=dbFor('alice');await assertSucceeds(updateDoc(doc(db,'playerProfiles','a'),{displayName:'أحمد',preferredNumber:0,updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,'playerProfiles','a'),{playerId:'b',updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,'playerProfiles','a'),{goals:99,updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,'users','alice'),{playerId:'b'}));await assertFails(updateDoc(doc(db,'playerProfiles','b'),{displayName:'Stolen',updatedAt:serverTimestamp()}));});
test('profile validation rejects blank, markup, long names and invalid numbers',async()=>{await seedLink();const ref=doc(dbFor('alice'),'playerProfiles','a');for(const displayName of ['', '   ', ' leading','trailing ','<script>','x'.repeat(41)])await assertFails(updateDoc(ref,{displayName,updatedAt:serverTimestamp()}));for(const preferredNumber of [-1,100,2.5,'9'])await assertFails(updateDoc(ref,{preferredNumber,updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(ref,{preferredNumber:null,updatedAt:serverTimestamp()}));});
test('admin starts server-timed voting atomically with the first entry, never reopens it',async()=>{
  await assertFails(openWithEntry('unapproved',{db:dbFor('alice')}));
  await assertSucceeds(openWithEntry('automatic'));
  const ref=doc(adminDb(),'sessionVotes','automatic');
  const initial=(await getDoc(ref)).data();
  assert.ok(initial.openedAt instanceof Timestamp);
  assert.deepEqual(initial.candidatePlayerIds,['a']);
  await assertFails(updateDoc(ref,{openedAt:Timestamp.fromMillis(initial.openedAt.toMillis()+1000)}));
  await assertFails(deleteDoc(ref));
  await assertFails(openWithEntry('fake-time',{session:{openedAt:Timestamp.fromMillis(1)}}));
});
test('opening requires a new same-commit log, not a missing or previously saved entry',async()=>{
  await assertFails(openWithEntry('missing',{saveEntry:false}));
  await setDoc(doc(adminDb(),'logs','first-existing'),{playerId:'a',date:'2026-09-06'});
  await assertFails(openWithEntry('existing',{saveEntry:false}));
  await assertFails(setDoc(doc(adminDb(),'sessionVotes','legacy-create'),sessionData()));
});
test('opening candidate, match key and date must match the first log, including matchId',async()=>{
  await assertFails(openWithEntry('wrong-player',{session:{candidatePlayerIds:['b']}}));
  await assertFails(openWithEntry('wrong-date',{session:{date:'2026-09-07'}}));
  await assertFails(openWithEntry('wrong-key',{session:{matchKey:'other'}}));
  await assertSucceeds(openWithEntry('match-id',{entry:{matchId:'round/أ'},session:{matchKey:'round/أ'}}));
});
test('invalid opening candidates and client closing times are rejected',async()=>{
  for (const [id,session] of [
    ['empty',{candidatePlayerIds:[]}],['multiple',{candidatePlayerIds:['a','b']}],
    ['duplicate',{candidatePlayerIds:['a','a']}],['extra',{closesAt:serverTimestamp()}]
  ]) await assertFails(openWithEntry(id,{session}));
});
test('admin appends candidates before deadline without changing timing or deleting choices',async()=>{
  await openWithEntry('append');
  const ref=doc(adminDb(),'sessionVotes','append');
  const openedAt=(await getDoc(ref)).data().openedAt;
  await assertSucceeds(updateDoc(ref,{candidatePlayerIds:['a','b','c','d']}));
  assert.ok((await getDoc(ref)).data().openedAt.isEqual(openedAt));
  await assertFails(updateDoc(ref,{candidatePlayerIds:['b','c','d']}));
  await assertFails(updateDoc(ref,{candidatePlayerIds:['a','b','c','d','d']}));
  await assertFails(updateDoc(ref,{candidatePlayerIds:Array.from({length:101},(_,i)=>i===0?'a':`p${i}`)}));
  await assertFails(updateDoc(ref,{matchKey:'another'}));
  await assertFails(updateDoc(ref,{firstEntryId:'replacement'}));
  await assertFails(updateDoc(doc(dbFor('alice'),'sessionVotes','append'),{candidatePlayerIds:['a','b','c','d','e']}));
});
test('legacy session candidates can append while open but not at/after deadline',async()=>{
  await seedSession('legacy');
  await assertSucceeds(updateDoc(doc(adminDb(),'sessionVotes','legacy'),{candidatePlayerIds:['a','b','c','d','e']}));
  await seedSession('closed',24*60*60*1000);
  await assertFails(updateDoc(doc(adminDb(),'sessionVotes','closed'),{candidatePlayerIds:['a','b','c','d','e']}));
});
test('clock starts at first entry, but ballots wait for at least four recorded candidates',async()=>{
  await openWithEntry('building');
  await seedLink('alice','e');
  const ref=doc(adminDb(),'sessionVotes','building');
  await updateDoc(ref,{candidatePlayerIds:['a','b','c']});
  const ballot={...ballotData('e'),firstPlayerId:'a',secondPlayerId:'b',thirdPlayerId:'c'};
  const ballotRef=doc(dbFor('alice'),'sessionVotes','building','ballots','alice');
  await assertFails(setDoc(ballotRef,ballot));
  await updateDoc(ref,{candidatePlayerIds:['a','b','c','d']});
  await assertSucceeds(setDoc(ballotRef,ballot));
});
test('guest, unapproved and unverified users cannot vote',async()=>{await seedSession();await assertFails(setDoc(doc(guestDb(),'sessionVotes','open','ballots','guest'),ballotData()));await assertFails(setDoc(doc(dbFor('alice'),'sessionVotes','open','ballots','alice'),ballotData()));await seedLink();await assertFails(setDoc(doc(dbFor('alice',false),'sessionVotes','open','ballots','alice'),ballotData()));});
test('one UID owns one ballot; voter cannot impersonate another account or player',async()=>{await seedSession();await seedLink();const db=dbFor('alice');await assertSucceeds(setDoc(doc(db,'sessionVotes','open','ballots','alice'),ballotData()));await assertFails(setDoc(doc(db,'sessionVotes','open','ballots','other-id'),ballotData()));await assertFails(updateDoc(doc(db,'sessionVotes','open','ballots','alice'),{voterPlayerId:'b',updatedAt:serverTimestamp()}));});
test('duplicate choices, self votes, absentees, arbitrary points and fields are denied',async()=>{await seedSession();await seedLink();const ref=doc(dbFor('alice'),'sessionVotes','open','ballots','alice');for(const change of [{secondPlayerId:'b'},{firstPlayerId:'a'},{firstPlayerId:'e'},{points:999},{admin:true},{firstPlayerId:99}])await assertFails(setDoc(ref,{...ballotData(),...change}));});
test('ballot can be reordered before closing while retaining original submittedAt',async()=>{await seedSession();await seedLink();const ref=doc(dbFor('alice'),'sessionVotes','open','ballots','alice');await setDoc(ref,ballotData());await assertSucceeds(updateDoc(ref,{firstPlayerId:'c',secondPlayerId:'b',updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{submittedAt:Timestamp.fromMillis(1),updatedAt:serverTimestamp()}));await assertFails(deleteDoc(ref));});
test('votes cannot be submitted before opening or at/after 24-hour deadline',async()=>{await seedLink();await seedSession('future',-60000);await seedSession('closed',24*60*60*1000);for(const id of ['future','closed'])await assertFails(setDoc(doc(dbFor('alice'),'sessionVotes',id,'ballots','alice'),ballotData()));});
test('closed ballots immutable for owners AND admin, but public can verify final totals',async()=>{await seedLink();await seedSession('closed',25*60*60*1000);await seed(db=>setDoc(doc(db,'sessionVotes','closed','ballots','alice'),ballotData()));const ref=doc(dbFor('alice'),'sessionVotes','closed','ballots','alice');await assertFails(updateDoc(ref,{firstPlayerId:'c',secondPlayerId:'b',updatedAt:serverTimestamp()}));await assertFails(deleteDoc(doc(adminDb(),'sessionVotes','closed','ballots','alice')));await assertSucceeds(getDocs(collection(guestDb(),'sessionVotes','closed','ballots')));});
test('live ballots/totals hidden from public, other users AND admin; own ballot readable',async()=>{await seedSession();await seedLink();await setDoc(doc(dbFor('alice'),'sessionVotes','open','ballots','alice'),ballotData());await assertSucceeds(getDoc(doc(dbFor('alice'),'sessionVotes','open','ballots','alice')));for(const db of [guestDb(),dbFor('bob'),adminDb(),dbFor('alice')])await assertFails(getDocs(collection(db,'sessionVotes','open','ballots')));await assertFails(getDoc(doc(adminDb(),'sessionVotes','open','ballots','alice')));});
