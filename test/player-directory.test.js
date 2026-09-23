import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildPlayerDirectory,buildPlayerAvatar} from '../ux-utils.js';
import {buildDataModel} from '../data-engine.js';
import {translate,countText} from '../i18n.js';

const players = [{id:'a',name:'أحمد علي'},{id:'b',name:'Bader <img>'},{id:'c',name:'Cameron'},{id:'d',name:'No appearances'}];
const log = (id,playerId,date,matchId,goals=0,extra={})=>({id,playerId,date,matchId,goals,side:'A',result:'win',...extra});
const logs = [log('1','a','2026-09-01','old',8),log('2','b','2026-09-02','first',2),log('3','c','2026-09-02','second',3),log('4','b','2026-09-02','first',1,{goalType:'own'})];
const model = buildDataModel(players,logs);

test('directory starts with every player, including no appearances',()=>{
  const result=buildPlayerDirectory(players,model);
  assert.equal(result.total,4);assert.equal(result.rows.length,4);
  assert.equal(result.latestDate,'2026-09-02');
  assert.equal(result.rows.find(p=>p.id==='d').stats.matches,0);
});
test('latest session includes every match on the latest date, with no duplicate players',()=>{
  const result=buildPlayerDirectory(players,model,'','name','latest');
  assert.deepEqual(result.rows.map(p=>p.id),['b','c']);assert.equal(result.total,2);
});
test('session search intersects attendance and keeps the roster denominator',()=>{
  const result=buildPlayerDirectory(players,model,'cam','goals','latest');
  assert.deepEqual(result.rows.map(p=>p.id),['c']);assert.equal(result.total,2);
  assert.equal(buildPlayerDirectory(players,model,'احمد','','latest').rows.length,0);
  assert.equal(buildPlayerDirectory(players,model,'علي احمد').rows[0].id,'a');
});
test('attendance filter never changes all-time totals or counts own goals as goals',()=>{
  const extended=buildDataModel(players,[...logs,log('5','b','2026-08-01','previous',4)]);
  const b=buildPlayerDirectory(players,extended,'','goals','latest').rows[0];
  assert.equal(b.id,'b');assert.equal(b.stats.matches,2);assert.equal(b.stats.goals,6);
});
test('latest date ignores invalid dates, unknown IDs and recent edits to old matches',()=>{
  const matches=new Map([...model.matchSummaries, ['invalid',{date:'2026-99-99',parts:[{playerId:'a'}]}],['edit',{date:'2026-08-01',createdAt:9999999999,parts:[{playerId:'a'}]}]]);
  matches.set('unknown',{date:'2026-09-02',parts:[{playerId:'orphan'}]});
  assert.deepEqual(buildPlayerDirectory(players,{...model,matchSummaries:matches},'','name','latest').rows.map(p=>p.id),['b','c']);
});
test('empty models and unknown scopes safely preserve the complete directory',()=>{
  assert.equal(buildPlayerDirectory(players,{}).rows.length,4);
  assert.equal(buildPlayerDirectory(players,{},'','name','latest').rows.length,0);
  assert.equal(buildPlayerDirectory(players,{},'','name','unexpected').rows.length,4);
  assert.deepEqual(buildPlayerDirectory(),{rows:[],total:0,latestDate:''});
});
test('directory does not mutate players, canonical records, forms or statistics',()=>{
  const before=JSON.stringify({players,stats:model.stats,matches:[...model.matchSummaries],forms:model.forms});
  for(const scope of ['all','latest'])for(const sort of ['name','goals','matches'])buildPlayerDirectory(players,model,'',sort,scope);
  assert.equal(JSON.stringify({players,stats:model.stats,matches:[...model.matchSummaries],forms:model.forms}),before);
});

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function renderPlayerCardsNameOnly()'),source.indexOf('function openProfile('));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function render({lang='en',scope='all',query='',sort='name',data=model,list=players}={}) {
  const buttons=['all','latest'].map(value=>({dataset:{directoryScope:value},setAttribute(k,v){this[k]=v;}}));
  const nodes={playerCards:{innerHTML:'',classList:{remove(){}}},playerSearch:{value:query},playerSort:{value:sort},playerDirectoryScopes:{querySelectorAll:()=>buttons},playerSearchCount:{},btnClearPlayerSearch:{},playerDirectoryDate:{}};
  runInNewContext(renderer+'\nrenderPlayerCardsNameOnly();',{$:id=>nodes[id],players:list,model:data,playerDirectoryScope:scope,buildPlayerDirectory,buildPlayerAvatar,language:lang,countText,esc,t:(key,v)=>translate(lang,key,v),formatMatchDate:date=>date,renderFormDots:forms=>forms.join(','),emptyState:(icon,title,lead)=>title+lead});
  return {nodes,buttons,html:nodes.playerCards.innerHTML};
}
test('actual renderer escapes names and displays the selected metric without ranking numbers',()=>{
  const goals=render({sort:'goals'}).html;
  assert.match(goals,/Bader &lt;img&gt;/);assert.doesNotMatch(goals,/<img>|displayRank/);
  assert.match(goals,/<strong>8<\/strong><span>Goals<\/span>/);
  assert.match(render().html,/<strong>1<\/strong><span>Matches<\/span>/);
});
test('actual renderer updates accessible scope, count, date and search reset in both languages',()=>{
  for(const lang of ['ar','en']){
    const result=render({lang,scope:'latest',query:'cam'});
    assert.equal(result.buttons[1]['aria-pressed'],'true');assert.equal(result.buttons[0]['aria-pressed'],'false');
    assert.equal(result.nodes.playerSearchCount.textContent,translate(lang,'searchResultsCount',{count:1,total:2}));
    assert.equal(result.nodes.playerDirectoryDate.dateTime,'2026-09-02');assert.equal(result.nodes.playerDirectoryDate.hidden,false);
    assert.equal(result.nodes.btnClearPlayerSearch.hidden,false);
  }
  assert.equal(render().nodes.playerDirectoryDate.hidden,true);assert.equal(render().nodes.btnClearPlayerSearch.hidden,true);
});
test('no results and empty/loading models expose no stale date or active session control',()=>{
  const missing=render({scope:'latest',query:'nothing'});
  assert.match(missing.html,/No matching players/);assert.equal(missing.nodes.playerSearchCount.textContent,'0 of 2 players');
  const empty=render({list:[],data:{}});
  assert.match(empty.html,/No players yet/);assert.equal(empty.buttons[1].disabled,true);assert.equal(empty.nodes.playerDirectoryDate.dateTime,'');
});
test('directory uses a stable live count, touch targets and a clear-search action that keeps scope',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="playerSearchCount"[^>]*role="status"/);
  assert.match(html,/id="playerSearch"[^>]*aria-describedby="playerSearchCount"/);
  assert.doesNotMatch(html,/<div id="playerCards"[^>]*aria-live/);
  const reset=source.slice(source.indexOf('$("btnClearPlayerSearch")?.addEventListener'),source.indexOf('$("historySearch")?.addEventListener'));
  assert.match(reset,/\.value = ""/);assert.match(reset,/focus\(\{preventScroll:true\}\)/);assert.doesNotMatch(reset,/playerDirectoryScope =/);
});
test('native directory buttons use explicit text color and honor hidden controls',()=>{
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.directory-player\{[^}]*appearance:none[^}]*color:var\(--text\)/);
  assert.match(css,/\.directory-card \[hidden\]\{display:none!important\}/);
});
