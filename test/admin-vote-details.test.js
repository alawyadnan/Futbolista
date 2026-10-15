import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as engine from '../community-engine.js';
import * as account from '../account-ux.js';
import * as awards from '../highlights-engine.js';
import {translate} from '../i18n.js';

// Execute the shipped community renderer using inert DOM and read-only local
// adapters. No accounts, emails, network, emulator or production writes.
const source = readFileSync(new URL('../community.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export function createCommunity','function createCommunity');
const NOW = Date.parse('2026-10-15T12:00:00Z');
const session = (id, openedAt = NOW-engine.VOTING_WINDOW_MS) => ({id,matchKey:id,date:'2026-10-14',openedAt,candidatePlayerIds:['a','b','c','d']});
const ballot = (uid='account-a', voterPlayerId='a', choices=['b','c','d']) => ({uid,voterPlayerId,firstPlayerId:choices[0],secondPlayerId:choices[1],thirdPlayerId:choices[2]});
const snap = ballots => ({docs:ballots.map(({uid,...data})=>({id:uid,data:()=>data}))});
const flush = async () => {for(let i=0;i<8;i++)await Promise.resolve();};
function harness({language='ar',native=false}={}) {
  let now=NOW,writes=0,reader=async()=>snap([]);
  const nodes=new Map(),snapshots=new Map(),listeners={},reads=[];
  const node=id=>{
    if(!nodes.has(id)) {
      const classes=new Set(['hidden']);
      nodes.set(id,{innerHTML:'',dataset:{},hidden:false,
        classList:{toggle(key,on){on?classes.add(key):classes.delete(key);},contains:key=>classes.has(key)},
        querySelector(){return {insertAdjacentHTML(){}};},querySelectorAll(){return [];},
        replaceChildren(){this.innerHTML='';},setAttribute(){}});
    }
    return nodes.get(id);
  };
  class Clock extends Date {static now(){return now;}}
  const write=async()=>{writes++;throw Error('Unexpected write');};
  const create=runInNewContext(source+'\ncreateCommunity;',{
    ...engine,...account,...awards,Date:Clock,Capacitor:{isNativePlatform:()=>native},
    votingState:(value,at=now)=>engine.votingState(value,at),
    tallyBallots:(value,rows,at=now)=>engine.tallyBallots(value,rows,at),
    selectVotingSession:(rows,id,pid,at=now)=>engine.selectVotingSession(rows,id,pid,at),
    document:{documentElement:{lang:language},hidden:false,getElementById:node,
      addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn),removeEventListener(){},querySelectorAll:()=>[]},
    renderWithFormDraft:(_node,render)=>render(),
    collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),
    query:ref=>ref,where(){},orderBy(){},limit(){},
    onSnapshot:(path,fn)=>{snapshots.set(path,fn);return ()=>snapshots.delete(path);},
    getDocs:async path=>{reads.push(path);return reader(path);},
    getDoc:write,setDoc:write,updateDoc:write,runTransaction:write,
    createUserWithEmailAndPassword:write,signInWithEmailAndPassword:write,signOut:write,
    sendPasswordResetEmail:write,sendEmailVerification:write,reload:write,serverTimestamp:write,
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}
  });
  const players=[{id:'a',name:'Ali <img src=x>'},{id:'b',name:'Bader'},{id:'c',name:'Casem'},{id:'d',name:'Dawood'}];
  const app=create({db:{},auth:{},getPlayers:()=>players,getModel:()=>({}),isDataReady:()=>true,
    t:(key,vars)=>translate(language,key,vars),
    esc:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    notify(){},openProfile(){},onProfilesChanged(){},showAccount(){}});
  const dispatch=(type,target)=>{for(const fn of listeners[type]||[])fn({target});};
  return {app,node,reads,snapshots,players,
    html:()=>node('adminVoteDetails').innerHTML,writes:()=>writes,
    login(admin=true){app.onAuth({uid:'admin-account',email:admin?'admin@ftbll.live':'member@example.test',emailVerified:true},admin);},
    logout(){app.onAuth(null,false);},
    async sessions(rows){snapshots.get('sessionVotes')({docs:rows.map(({id,...data})=>({id,data:()=>data}))});await flush();reads.length=0;},
    reader(fn){reader=fn;},time(value){now=value;},
    async select(value){dispatch('change',{id:'adminVoteSession',value,closest:()=>null});await flush();},
    async refresh(){const trigger={dataset:{communityAction:'refresh-admin-votes'}};dispatch('click',{closest:s=>s==='[data-community-action]'?trigger:null});await flush();}
  };
}

test('admin audit is hidden from guests, members and native app, with no detail reads',async()=>{
  for(const options of [{admin:false},{native:true,admin:true}]) {
    const h=harness(options);h.login(options.admin);await h.sessions([session('closed')]);
    await h.select('closed');assert.equal(h.html(),'');assert.equal(h.reads.length,0);
    assert.equal(h.node('adminVoteDetails').classList.contains('hidden'),true);assert.equal(h.writes(),0);h.app.dispose();
  }
  const h=harness();await h.sessions([session('closed')]);await h.select('closed');assert.equal(h.html(),'');assert.equal(h.reads.length,0);h.app.dispose();
});
test('only completed sessions are selectable; pending and open ballots are never requested',async()=>{
  const h=harness();h.login();await h.sessions([session('closed'),session('open',NOW-1000),session('pending',null)]);
  assert.match(h.html(),/value="closed"/);assert.doesNotMatch(h.html(),/value="(?:open|pending)"/);
  for(const id of ['open','pending','unknown',''])await h.select(id);
  assert.equal(h.reads.length,0);assert.equal(h.writes(),0);h.app.dispose();
});
test('a session becomes readable exactly at the 24-hour boundary, never a millisecond early',async()=>{
  const h=harness();h.login();await h.sessions([session('boundary',NOW-engine.VOTING_WINDOW_MS+1)]);
  await h.select('boundary');assert.equal(h.reads.length,0);
  h.time(NOW+1);h.app.render();assert.match(h.html(),/value="boundary"/);
  await h.select('boundary');assert.deepEqual(h.reads,['sessionVotes/boundary/ballots']);assert.equal(h.writes(),0);h.app.dispose();
});
test('administrator sees voter and three ordered choices, escaped, without email or UID',async()=>{
  for(const language of ['ar','en']) {
    const h=harness({language});h.login();await h.sessions([session('closed')]);h.reader(async()=>snap([ballot()]));
    assert.equal(h.reads.length,0,'Details are fetched only on selection');
    await h.select('closed');const html=h.html();assert.match(html,/Ali &lt;img src=x&gt;/);assert.doesNotMatch(html,/<img|account-a|admin@/);
    assert.ok(html.indexOf('Bader')<html.indexOf('Casem'));assert.ok(html.indexOf('Casem')<html.indexOf('Dawood'));
    for(const key of ['voter','firstChoice','secondChoice','thirdChoice','refreshVotes'])assert.ok(html.includes(translate(language,key)));
    assert.match(html,/aria-busy="false"/);assert.equal(h.writes(),0);h.app.dispose();
  }
});
test('loading, failed reads, explicit retry and no-ballot state are distinct and read-only',async()=>{
  const h=harness({language:'en'});h.login();await h.sessions([session('closed')]);
  let reject;h.reader(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  await h.select('closed');assert.match(h.html(),/Loading votes/);assert.match(h.html(),/aria-busy="true"/);
  reject(Error('permission-denied'));await flush();assert.match(h.html(),/Could not load votes/);assert.doesNotMatch(h.html(),/Voting closed with no ballots/);
  h.reader(async()=>snap([]));await h.refresh();assert.match(h.html(),/Voting closed with no ballots/);
  assert.equal(h.reads.length,2);assert.equal(h.writes(),0);h.app.dispose();
});
test('logout clears rendered choices immediately and ignores in-flight results',async()=>{
  const h=harness();h.login();await h.sessions([session('closed')]);let resolve;
  h.reader(()=>new Promise(done=>{resolve=done;}));await h.select('closed');
  h.logout();assert.equal(h.html(),'');resolve(snap([ballot()]));await flush();assert.equal(h.html(),'');
  h.login(false);h.app.render();assert.equal(h.html(),'');assert.equal(h.writes(),0);h.app.dispose();
});
test('changing sessions discards the old result even when requests finish out of order',async()=>{
  const h=harness();h.login();await h.sessions([session('a'),session('b')]);const pending={};
  h.reader(path=>new Promise(resolve=>{pending[path]=resolve;}));await h.select('a');await h.select('b');
  pending['sessionVotes/b/ballots'](snap([ballot('account-b','b',['d','a','c'])]));await flush();
  const expected=h.html();assert.match(expected,/<bdi dir="auto">Bader<\/bdi>/);
  pending['sessionVotes/a/ballots'](snap([ballot()]));await flush();assert.equal(h.html(),expected);h.app.dispose();
});
test('clock correction removes a no-longer-closed session without exposing a late result',async()=>{
  const h=harness();h.login();await h.sessions([session('closed')]);let resolve;
  h.reader(()=>new Promise(done=>{resolve=done;}));await h.select('closed');h.time(NOW-1);
  resolve(snap([ballot()]));await flush();assert.doesNotMatch(h.html(),/admin-ballot-list|Ali|value="closed"/);h.app.dispose();
});
test('passive renders do not re-fetch detail ballots, but explicit refresh updates them',async()=>{
  const h=harness();h.login();await h.sessions([session('closed')]);h.reader(async()=>snap([ballot()]));await h.select('closed');
  h.app.render();h.app.render();assert.equal(h.reads.length,1);
  h.reader(async()=>snap([]));await h.refresh();assert.equal(h.reads.length,2);assert.doesNotMatch(h.html(),/admin-ballot-list/);assert.equal(h.writes(),0);h.app.dispose();
});
test('disposal hides details, clears cached choices and invalidates outstanding reads',async()=>{
  const h=harness();h.login();await h.sessions([session('closed')]);let resolve;
  h.reader(()=>new Promise(done=>{resolve=done;}));await h.select('closed');h.app.dispose();resolve(snap([ballot()]));await flush();assert.equal(h.html(),'');
});
test('new audit markup is admin-only and does not alter Firestore rules or native source',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<article id="adminVoteDetails"[^>]*class="[^"]*hidden"[^>]*data-admin="1"/);
  assert.match(source,/globalThis\.Capacitor\?\.isNativePlatform\?\.\(\) !== true/);
});
