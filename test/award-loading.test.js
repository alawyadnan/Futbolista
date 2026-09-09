import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as engine from '../community-engine.js';
import * as awards from '../highlights-engine.js';
import * as account from '../account-ux.js';
import { translate } from '../i18n.js';

function harness(fail = new Set()) {
  const snapshots=new Map(),listeners={},nodes=new Map(),reads=[];
  let latest, active=0, maxActive=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',dataset:{},classList:{toggle(){},contains(){return false;}},querySelector(){return {insertAdjacentHTML(){}};},querySelectorAll:()=>[],replaceChildren(){},setAttribute(){}});return nodes.get(id);};
  const getDocs=async path=>{
    reads.push(path);active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
    if(fail.has(path))throw Error('offline');
    return {docs:[{id:'voter',data:()=>({voterPlayerId:'d',firstPlayerId:'a',secondPlayerId:'b',thirdPlayerId:'c'})}]};
  };
  const create=runInNewContext(readFileSync(new URL('../community.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function createCommunity','function createCommunity')+'\ncreateCommunity;',{
    ...engine,...awards,...account,
    document:{documentElement:{lang:'en'},getElementById:node,querySelectorAll:()=>[],addEventListener:(type,fn)=>{(listeners[type] ||= []).push(fn);}},
    renderWithFormDraft:(_root,fn)=>fn(),
    collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),query:ref=>ref,where(){},orderBy(){},limit(){},
    onSnapshot:(path,fn)=>{snapshots.set(path,fn);return ()=>snapshots.delete(path);},getDocs,
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}
  });
  const app=create({db:{},auth:{},getModel:()=>({}),getPlayers:()=>[],isDataReady:()=>true,t:(key,vars)=>translate('en',key,vars),esc:String,notify(){},openProfile(){},onProfilesChanged(){},showAccount(){},onResultsChanged:state=>{latest=state;}});
  return {app,reads,maxActive:()=>maxActive,state:()=>latest,
    sessions(rows){snapshots.get('sessionVotes')({docs:rows.map(row=>({id:row.id,data:()=>row}))});},
    retry(){for(const fn of listeners.click)fn({target:{closest:selector=>selector==='[data-community-action]'?{dataset:{communityAction:'retry-results'}}:null}});}};
}
const session=(id,open=false)=>({id,matchKey:id,date:'2026-08-01',candidatePlayerIds:['a','b','c','d'],openedAt:Date.now()-(open?1:26)*3600000});
async function until(predicate) {for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('Expected async state was not reached');}

test('actual archive loader reads all closed sessions, no open ballots, with at most four concurrent reads',async()=>{
  const h=harness();const rows=Array.from({length:13},(_,i)=>session(`closed-${i}`));rows.unshift(session('open',true));
  h.sessions(rows);await until(()=>h.state()?.results.size===13);
  assert.equal(h.reads.length,13);assert.ok(h.maxActive()<=4);assert.ok(h.reads.every(path=>!path.includes('/open/')));
  h.sessions(rows);await until(()=>h.state()?.ready);assert.equal(h.reads.length,13);
  h.app.dispose();
});
test('failed archive reads stay unknown and manual retry recovers without rereading successes',async()=>{
  const fail=new Set(['sessionVotes/b/ballots']);const h=harness(fail);
  h.sessions([session('a'),session('b')]);await until(()=>h.state()?.error);
  assert.equal(h.state().results.size,1);fail.clear();h.retry();
  await until(()=>h.state()?.results.size===2);assert.equal(h.reads.filter(path=>path.includes('/a/')).length,1);
  assert.equal(h.state().error,false);h.app.dispose();
});
