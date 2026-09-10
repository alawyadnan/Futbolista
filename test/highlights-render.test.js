import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as engine from '../highlights-engine.js';
import * as statistics from '../award-statistics.js';
import { buildDataModel } from '../data-engine.js';
import { buildPlayerAvatar } from '../ux-utils.js';
import { translate } from '../i18n.js';

function harness({loading=false,language='en'}={}) {
  let admin=false,listener,click,fail=false,profileId='a'; const nodes=new Map(),writes=[];
  const node=id=>{ if(!nodes.has(id)){const classes=new Set();nodes.set(id,{innerHTML:'',classList:{toggle(key,on){on?classes.add(key):classes.delete(key);},remove(key){classes.delete(key);},contains:key=>classes.has(key)},querySelector(){return null;},replaceChildren(){this.innerHTML='';}});}return nodes.get(id); };
  const players=[{id:'a',name:'Ali <img>'},{id:'b',name:'B'}];
  const logs=Array.from({length:6},(_,i)=>({id:String(i),playerId:'a',date:`2026-08-0${i+1}`,result:'win',side:'A',goals:1}));
  const model=buildDataModel(players,logs);
  const create=runInNewContext(readFileSync(new URL('../highlights.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function createHighlights','function createHighlights')+'\ncreateHighlights;',{
    ...engine,...statistics,buildPlayerAvatar,document:{documentElement:{lang:language},getElementById:node,addEventListener:(_event,fn)=>{click=fn;},removeEventListener(){}},
    collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>1,
    onSnapshot:(_path,fn)=>{listener=fn;return ()=>{};},setDoc:async(path,value)=>{if(fail)throw Error('denied');writes.push({path,value});}
  });
  const app=create({db:{},getModel:()=>loading?{}:model,getProfileId:()=>profileId,isAdmin:()=>admin,t:(key,vars)=>translate(language,key,vars),esc:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),notify(){}});
  listener({docs:[]});
  return {app,node,writes,model,profile(value){profileId=value;app.render();},admin(value){admin=value;app.render();},fail(value){fail=value;},preferences(docs){listener({docs});},click:dataset=>click({target:{closest:()=>({dataset})}})};
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
test('new MOTM showcase keeps every joint winner and one shared point total',()=>{
  const h=harness(),state=results();
  state.results.values().next().value.ranking.push({playerId:'b',points:5,first:1,second:0,third:0});
  h.app.setResults(state);const html=h.node('dashboardMotm').innerHTML;
  assert.match(html,/data-open-player="a"/);assert.match(html,/data-open-player="b"/);
  assert.match(html,/Joint Men of the Match/);assert.match(html,/class="motm-score"><strong>5/);
  assert.equal((html.match(/class="motm-score"/g)||[]).length,1);
});
test('empty and failed MOTM results never show a made-up hero score',()=>{
  const h=harness(),empty=results();empty.results.values().next().value.totalBallots=0;
  empty.results.values().next().value.ranking=[];h.app.setResults(empty);
  assert.doesNotMatch(h.node('dashboardMotm').innerHTML,/class="motm-score"/);
  const failed=results();failed.results.clear();failed.error=true;h.app.setResults(failed);
  assert.doesNotMatch(h.node('dashboardMotm').innerHTML,/class="motm-score"/);
  assert.match(h.node('dashboardMotm').innerHTML,/retry-results/);
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
test('public pages omit the scoring formula in both languages; profile details start collapsed',()=>{
  for(const language of ['ar','en']) {
    const h=harness({language});h.app.setResults(results());
    const profile=h.node('profileHighlights').innerHTML;
    assert.doesNotMatch(profile+h.node('dashboardAwardRanking').innerHTML,/votePointsRule|التصويت المقفل|Closed votes|× [135]/);
    assert.match(profile,/<details class="vote-details" data-player-id="a" >\s*<summary>/);
    assert.equal(h.writes.length,0);
  }
});
test('empty dashboard podium is hidden only after a successful complete archive read',()=>{
  const h=harness(),box=h.node('dashboardAwardRanking');
  assert.equal(box.classList.contains('hidden'),false);
  h.app.setResults({sessions:[],results:new Map(),ready:true,error:false});
  assert.equal(box.classList.contains('hidden'),true);assert.equal(box.innerHTML,'');
  h.app.setResults({sessions:[],results:new Map(),ready:true,error:true});
  assert.equal(box.classList.contains('hidden'),false);assert.match(box.innerHTML,/retry-results/);
  h.app.setResults(results());assert.equal(box.classList.contains('hidden'),false);
});
test('leader bars match the selected total and treat tied leaders equally',async()=>{
  const h=harness(),state=results();
  state.results.values().next().value.ranking.push({playerId:'b',points:3,first:0,second:1,third:0});
  h.app.setResults(state);
  assert.match(h.node('dashboardAwardRanking').innerHTML,/width:100%/);
  assert.match(h.node('dashboardAwardRanking').innerHTML,/width:60%/);
  state.results.values().next().value.ranking[1]={...state.results.values().next().value.ranking[0],playerId:'b'};
  h.app.setResults({...state});
  assert.equal((h.node('dashboardAwardRanking').innerHTML.match(/award-leader is-first/g)||[]).length,2);
  await h.click({awardRanking:'motmAwards'});
  assert.equal((h.node('dashboardAwardRanking').innerHTML.match(/width:100%/g)||[]).length,2);
});
test('open details survive result refresh for the same player, not navigation to another',()=>{
  const h=harness(),state=results();
  state.results.values().next().value.ranking.push({playerId:'b',points:3,first:0,second:1,third:0});
  h.app.setResults(state);
  h.node('profileHighlights').querySelector=()=>({open:true,dataset:{playerId:'a'}});
  h.app.render();assert.match(h.node('profileHighlights').innerHTML,/data-player-id="a" open>/);
  h.profile('b');assert.match(h.node('profileHighlights').innerHTML,/data-player-id="b" >/);
  assert.equal(h.writes.length,0);
});
test('zero-point profiles keep their total without an empty breakdown',()=>{
  const h=harness();h.app.setResults(results());h.profile('b');
  assert.match(h.node('profileVotePointsStat').innerHTML,/stValue">0/);
  assert.doesNotMatch(h.node('profileHighlights').innerHTML,/vote-details/);
});
test('active voting appears before all-time rankings and streaks in keyboard and visual order',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('id="dashboardVoting"')<html.indexOf('id="dashboardAwardRanking"'));
  assert.ok(html.indexOf('id="dashboardVoting"')<html.indexOf('id="dashboardTrends"'));
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
