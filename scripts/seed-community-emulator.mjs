// Disposable UI fixtures ONLY. No production project, host override, or fallback.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { randomUUID } from 'node:crypto';
if (process.env.FUTBOLISTA_ALLOW_EMULATOR_WRITES !== '1') throw new Error('Seeding writes emulator data. Explicit approval and FUTBOLISTA_ALLOW_EMULATOR_WRITES=1 are required.');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Start both loopback demo-futbolista emulators first.');
const env = await initializeTestEnvironment({projectId:'demo-futbolista'});
// Only the disposable demo project is cleared. Reuse our four local Auth
// fixtures with fresh random passwords so repeated QA never needs real accounts.
await env.clearFirestore();
async function authFixture(method, body) {
  const response=await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${method}?key=demo-key`,{
    method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify(body)
  });
  const result=await response.json();
  if(!response.ok)throw new Error(`Local Auth fixture failed: ${result.error?.message || response.status}`);
  return result;
}
const accounts=[];
for (const [role,email] of [['admin','admin@ftbll.live'],['linked','qa-linked@example.test'],['pending','qa-pending@example.test'],['rejected','qa-rejected@example.test']]) {
  const password=randomUUID();
  const existing=(await authFixture('lookup',{email:[email]})).users?.[0];
  const account=existing || await authFixture('signUp',{email,password});
  await authFixture('update',{localId:account.localId,password,emailVerified:true});
  accounts.push({role,email,password,uid:account.localId});
}
await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  const names=['QA أحمد علي','QA يوسف محمد','QA حسن','QA عبدالله عبدالرحمن الطويل','QA Zaid','QA Omar'];
  for (let i=0;i<names.length;i++)await setDoc(doc(db,'players',`qa-${i}`),{name:names[i],createdAt:i});
  for(let day=1;day<=12;day++)for(let player=0;player<6;player++)await setDoc(doc(db,'logs',`qa-${day}-${player}`),{playerId:`qa-${player}`,date:`2026-08-${String(day).padStart(2,'0')}`,goals:(day+player)%4,result:day%3===0?'draw':(day+player)%2===0?'win':'loss',side:player<3?'A':'B',createdAt:day});
  await setDoc(doc(db,'logs','qa-own'),{playerId:'qa-0',date:'2026-08-12',goals:1,ownGoal:true,result:'draw',side:'A',createdAt:12});
  const linked=accounts.find(account=>account.role==='linked');
  await setDoc(doc(db,'users',linked.uid),{playerId:'qa-0',createdAt:Timestamp.now()});
  await setDoc(doc(db,'playerClaims','qa-0'),{uid:linked.uid,createdAt:Timestamp.now()});
  await setDoc(doc(db,'playerProfiles','qa-0'),{displayName:'QA أحمد علي',preferredNumber:10,updatedAt:Timestamp.now()});
  for(const role of ['pending','rejected']){const account=accounts.find(item=>item.role===role);await setDoc(doc(db,'accountRequests',account.uid),{requestedPlayerId:role==='pending'?'qa-1':'qa-2',email:account.email,status:role,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});}
  for (const [day,hours] of [['10',25],['11',1]])await setDoc(doc(db,'sessionVotes',`2026-08-${day}`),{matchKey:`2026-08-${day}`,date:`2026-08-${day}`,candidatePlayerIds:names.map((_,i)=>`qa-${i}`),openedAt:Timestamp.fromMillis(Date.now()-hours*3600000)});
  // The linked player attended the 11th, but NOT the newer training on the 13th.
  for(let player=1;player<6;player++)await setDoc(doc(db,'logs',`qa-13-${player}`),{playerId:`qa-${player}`,date:'2026-08-13',goals:1,result:'draw',side:player<3?'A':'B',createdAt:13});
  await setDoc(doc(db,'sessionVotes','2026-08-13'),{matchKey:'2026-08-13',date:'2026-08-13',candidatePlayerIds:['qa-1','qa-2','qa-3','qa-4','qa-5'],openedAt:Timestamp.fromMillis(Date.now()-1800000)});
  await setDoc(doc(db,'sessionVotes','2026-08-10','ballots',linked.uid),{voterPlayerId:'qa-0',firstPlayerId:'qa-1',secondPlayerId:'qa-2',thirdPlayerId:'qa-3',submittedAt:Timestamp.fromMillis(Date.now()-25*3600000),updatedAt:Timestamp.fromMillis(Date.now()-25*3600000)});
});
await env.cleanup();
console.log(JSON.stringify({notice:'Disposable LOCAL emulator accounts, not production credentials',accounts}));
