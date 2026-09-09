// Optional, disposable QA extension. Never used by the website or production.
// First run seed-community-emulator.mjs to prepare the local Auth fixtures.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
if (process.env.FUTBOLISTA_ALLOW_EMULATOR_WRITES !== '1') throw new Error('Explicit local-test-write approval required.');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Loopback demo emulators only.');
const lookup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({email:['qa-linked@example.test']})});
const uid = (await lookup.json()).users?.[0]?.localId;
if (!uid) throw new Error('Run the existing local community fixture first.');
const env = await initializeTestEnvironment({projectId:'demo-futbolista'});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  const names=['QA أحمد علي','QA يوسف محمد','QA حسن','QA عبدالله عبدالرحمن الطويل','QA Zaid','QA Omar'];
  const ids=names.map((_,i)=>`qa-${i}`);
  for(let i=0;i<names.length;i++) await setDoc(doc(db,'players',ids[i]),{name:names[i],createdAt:i});
  await setDoc(doc(db,'users',uid),{playerId:'qa-0',createdAt:Timestamp.now()});
  await setDoc(doc(db,'playerClaims','qa-0'),{uid,createdAt:Timestamp.now()});
  for(let day=1;day<=16;day++) {
    const date=`2026-08-${String(day).padStart(2,'0')}`;
    for(let p=0;p<6;p++) await setDoc(doc(db,'logs',`${day}-${p}`),{playerId:ids[p],date,side:p<3?'A':'B',result:p<3?'win':'loss',goals:p===0?2:p<3?1:0,createdAt:day});
    const openedAt=Timestamp.fromMillis(Date.now()-(day===16?1:26)*3600000);
    await setDoc(doc(db,'sessionVotes',date),{matchKey:date,date,candidatePlayerIds:ids,openedAt});
    if(day<16) {
      const winner=[1,4,7,13,14,15].includes(day)?'qa-0':'qa-1';
      await setDoc(doc(db,'sessionVotes',date,'ballots','fixture-voter'),{voterPlayerId:'qa-4',firstPlayerId:winner,secondPlayerId:'qa-2',thirdPlayerId:'qa-3',submittedAt:openedAt,updatedAt:openedAt});
    }
  }
});
await env.cleanup();
console.log('Prepared demo-futbolista only: 6 QA players, 16 matches, 15 closed votes and 1 open vote.');
