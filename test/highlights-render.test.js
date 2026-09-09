import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as engine from '../highlights-engine.js';
import * as statistics from '../award-statistics.js';
import { buildDataModel } from '../data-engine.js';
import { buildPlayerAvatar } from '../ux-utils.js';
import { translate } from '../i18n.js';

function harness({loading=false}={}) {
  let admin=false,listener,click,fail=false; const nodes=new Map(),writes=[];
  const node=id=>{ if(!nodes.has(id))nodes.set(id,{innerHTML:'',classList:{toggle(){},remove(){}},querySelector(){return null;},replaceChildren(){this.innerHTML='';}});return nodes.get(id); };
  const players=[{id:'a',name:'Ali <img>'},{id:'b',name:'B'}];
  const logs=Array.from({length:6},(_,i)=>({id:String(i),playerId:'a',date:`2026-08-0${i+1}`,result:'win',side:'A',goals:1}));
  const model=buildDataModel(players,logs);
  const create=runInNewContext(readFileSync(new URL('../highlights.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function createHighlights','function createHighlights')+'\ncreateHighlights;',{
    ...engine,...statistics,buildPlayerAvatar,document:{documentElement:{lang:'en'},getElementById:node,addEventListener:(_event,fn)=>{click=fn;},removeEventListener(){}},
    collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>1,
    onSnapshot:(_path,fn)=>{listener=fn;return ()=>{};},setDoc:async(path,value)=>{if(fail)throw Error('denied');writes.push({path,value});}
  });
  const app=create({db:{},getModel:()=>loading?{}:model,getProfileId:()=> 'a',isAdmin:()=>admin,t:(key,vars)=>translate('en',key,vars),esc:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),notify(){}});
  listener({docs:[]});
  return {app,node,writes,model,admin(value){admin=value;app.render();},fail(value){fail=value;},preferences(docs){listener({docs});},click:dataset=>click({target:{closest:()=>({dataset})}})};
}
function results() {
  const session={id:'2026-08-06',matchKey:'2026-08-06',date:'2026-08-06',openedAt:Date.now()-26*3600000};
  return {sessions:[session],results:new Map([[session.id,{totalBallots:1,ranking:[{playerId:'a',points:5,first:1,second:0,third:0}]}]]),ready:true,error:false};
}
test('a direct profile link is safe before the first football snapshot',()=>{
  const h=harness({loading:true});h.app.setResults(results());
  assert.equal(h.node('profileHighlights').innerHTML,'');assert.equal(h.writes.length,0);
});
test('actual renderer shows the latest MOTM, exact career total and escaped player names',()=>{
  const h=harness();h.app.setResults(results());
  assert.match(h.node('dashboardMotm').innerHTML,/MOTM/); assert.match(h.node('dashboardMotm').innerHTML,/Ali &lt;img&gt;/);
  assert.match(h.node('profileMotmStat').innerHTML,/class="stValue">1/);
  assert.match(h.node('profileHighlights').innerHTML,/data-open-match="2026-08-06"/);
  assert.equal(h.writes.length,0);
});
test('missing award results render unknown total with retry, never a false zero',()=>{
  const h=harness(),state=results();state.results.clear();state.error=true;h.app.setResults(state);
  assert.match(h.node('profileMotmStat').innerHTML,/class="stValue">—/);
  assert.match(h.node('profileHighlights').innerHTML,/data-community-action="retry-results"/);
  assert.match(h.node('profileVotePointsStat').innerHTML,/class="stValue">—/);
  assert.doesNotMatch(h.node('dashboardAwardRanking').innerHTML,/class="award-leader"/);
});
test('profile and dashboard use voting points, with monthly awards separate and no writes',()=>{
  const h=harness();h.app.setResults(results());
  assert.match(h.node('profileVotePointsStat').innerHTML,/class="stValue">5/);
  assert.match(h.node('dashboardAwardRanking').innerHTML,/data-award-table="votingPoints"/);
  assert.match(h.node('profileHighlights').innerHTML,/vote-choice-breakdown/);
  assert.match(h.node('profileHighlights').innerHTML,/monthly-record/);
  assert.equal(h.app.getStatistics().byPlayer.get('a').votingPoints,5);assert.equal(h.writes.length,0);
});
test('dashboard switches between points and awards without a data write',async()=>{
  const h=harness();h.app.setResults(results());await h.click({awardRanking:'motmAwards'});
  assert.match(h.node('dashboardAwardRanking').innerHTML,/data-award-table="motmAwards"/);
  assert.match(h.node('dashboardAwardRanking').innerHTML,/data-award-ranking="motmAwards" aria-pressed="true"/);
  assert.equal(h.writes.length,0);
});
test('only admin sees hide controls; hiding and restoring target a display preference, not football data',async()=>{
  const h=harness();h.app.setResults(results());
  assert.doesNotMatch(h.node('dashboardTrends').innerHTML,/data-hide-trend/);
  h.admin(true);assert.match(h.node('dashboardTrends').innerHTML,/data-hide-trend/);
  const row=engine.computeTrends(h.model).find(t=>t.playerId==='a'&&t.type==='wins');
  await h.click({hideTrend:row.id});
  assert.equal(h.writes.length,1); assert.ok(h.writes[0].path.startsWith('trendVisibility/')); assert.equal(h.writes[0].value.hidden,true);
  h.preferences([{id:row.id,data:()=>({hidden:true})}]);
  assert.doesNotMatch(h.node('profileHighlights').innerHTML,/6 wins in a row/);
  assert.match(h.node('trendSettings').innerHTML,/data-restore-trend/);
  await h.click({restoreTrend:row.id});assert.equal(h.writes[1].value.hidden,false);
  assert.match(h.node('profileMotmStat').innerHTML,/class="stValue">1/);
});
test('logout immediately removes controls and stale click cannot write',async()=>{
  const h=harness();h.admin(true);h.admin(false);
  assert.equal(h.node('trendSettings').innerHTML,'');
  await h.click({hideTrend:engine.computeTrends(h.model)[0].id});assert.equal(h.writes.length,0);
});
test('failed suppression does not remove the original streak',async()=>{
  const h=harness();h.admin(true);h.fail(true);
  await h.click({hideTrend:engine.computeTrends(h.model)[0].id});
  assert.match(h.node('dashboardTrends').innerHTML,/6 wins in a row/);assert.equal(h.writes.length,0);
});
