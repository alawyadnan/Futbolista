import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as engine from '../community-engine.js';
import * as accountUx from '../account-ux.js';
import { translate } from '../i18n.js';

// Execute the actual renderer with inert DOM/Firebase adapters. No network,
// accounts, emails, Firestore writes or emulator fixtures are needed.
function harness(language = 'ar') {
  const listeners = {}, snapshots = new Map(), nodes = new Map();
  let writes = 0;
  const node = id => {
    if (nodes.has(id)) return nodes.get(id);
    const element = {
      innerHTML:'',textContent:'',type:'password',dataset:{},hidden:false,
      classList:{toggle(){},contains(){return false;}},
      querySelector(){return {insertAdjacentHTML(_position,html){element.innerHTML += html;}};},
      querySelectorAll(){return [];},replaceChildren(){this.innerHTML='';},
      setAttribute(key,value){this[key]=value;},focus(){}
    };
    nodes.set(id,element); return element;
  };
  const document = {
    documentElement:{lang:language},hidden:false,getElementById:node,
    querySelectorAll:()=>[],addEventListener:(type,fn)=>{(listeners[type] ||= []).push(fn);}
  };
  const write = async () => { writes++; throw new Error('Unexpected write in renderer'); };
  const source = readFileSync(new URL('../community.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace('export function createCommunity','function createCommunity');
  const create = runInNewContext(source+'\ncreateCommunity;',{
    ...engine,...accountUx,document,
    renderWithFormDraft:(_root,render)=>render(),
    collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),
    query:(ref)=>ref,where(){},orderBy(){},limit(){},
    onSnapshot:(path,callback)=>{snapshots.set(path,callback);return ()=>snapshots.delete(path);},
    getDoc:write,getDocs:write,setDoc:write,updateDoc:write,runTransaction:write,
    createUserWithEmailAndPassword:write,signInWithEmailAndPassword:write,
    signOut:write,sendPasswordResetEmail:write,sendEmailVerification:write,
    reload:write,serverTimestamp:write,
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}
  });
  const app = create({
    db:{},auth:{},getPlayers:()=>[{id:'p',name:'Ali'}],getModel:()=>({}),isDataReady:()=>true,
    t:(key,vars)=>translate(language,key,vars),esc:value=>String(value).replace(/[&<>"']/g,character=>`&#${character.charCodeAt(0)};`),
    notify(){},openProfile(){},onProfilesChanged(){},showAccount(){}
  });
  function login({verified=true,status='',linked=false,admin=false}={}) {
    app.onAuth({uid:'local-render-test',email:'render@example.test',emailVerified:verified},admin);
    snapshots.get('users/local-render-test')?.({exists:()=>linked,data:()=>({playerId:'p'})});
    snapshots.get('accountRequests/local-render-test')?.({exists:()=>!!status,data:()=>({status,requestedPlayerId:'p'})});
  }
  function click(action) {
    const trigger = {dataset:{communityAction:action},setAttribute(key,value){this[key]=value;}};
    for (const fn of listeners.click || []) fn({target:{closest:selector=>selector==='[data-community-action]' ? trigger : null}});
    return trigger;
  }
  return {app,login,click,node,html:()=>node('accountContent').innerHTML,writes:()=>writes};
}

test('actual verification screen includes spam advice and three accessible steps', () => {
  const h = harness(); h.login({verified:false});
  assert.match(h.html(),/Spam/);
  assert.equal((h.html().match(/aria-current="step"/g)||[]).length,1);
  assert.match(h.html(),/data-community-action="refresh-account"/);
  assert.doesNotMatch(h.html(),/id="linkPlayerForm"|id="profileEditForm"/);
  assert.equal(h.writes(),0);
});
test('pending request hides editing until requested and can be cancelled without a write', () => {
  const h = harness(); h.login({status:'pending'});
  assert.match(h.html(),/account-requested/);
  assert.doesNotMatch(h.html(),/id="linkPlayerForm"/);
  h.click('edit-request'); assert.match(h.html(),/id="linkPlayerForm"/);
  h.click('cancel-request-edit'); assert.doesNotMatch(h.html(),/id="linkPlayerForm"/);
  assert.equal(h.writes(),0);
});
test('rejected request offers correction and does not present account deletion', () => {
  const h = harness('en'); h.login({status:'rejected'});
  assert.match(h.html(),/Your account is still active/);
  assert.match(h.html(),/id="linkPlayerForm"/);
  assert.equal(h.writes(),0);
});
test('linked profile and admin account preserve their separate screens', () => {
  const h = harness(); h.login({linked:true});
  assert.match(h.html(),/id="profileEditForm"/);
  assert.doesNotMatch(h.html(),/account-journey/);
  h.login({admin:true});
  assert.doesNotMatch(h.html(),/id="profileEditForm"|id="linkPlayerForm"/);
  assert.equal(h.writes(),0);
});
test('password visibility is accessible and resets when changing authentication mode', () => {
  const h = harness('en'); h.app.onAuth(null,false);
  const trigger = h.click('toggle-password');
  assert.equal(h.node('accountPassword').type,'text');
  assert.equal(trigger['aria-pressed'],'true');
  h.click('signup-mode');
  assert.match(h.html(),/id="accountPassword"[^>]+type="password"/);
  assert.match(h.html(),/autocomplete="new-password"/);
  assert.equal(h.writes(),0);
});
