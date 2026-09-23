import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildDataModel,computeHeadToHead} from '../data-engine.js';
import {computeSharedMatches} from '../insights-engine.js';
import {paginateItems,parseAppRoute} from '../ux-utils.js';
import {translate,countText} from '../i18n.js';

const players=[{id:'a',name:'Ali <script>'},{id:'b',name:'Bader'},{id:'c',name:'Cameron'}];
const entry=(id,playerId,date,matchId,side,result,goals=0,extra={})=>({id,playerId,date,matchId,side,result,goals,...extra});
const logs=[
  entry('a1','a','2026-09-01','m1','A','win',2),entry('b1','b','2026-09-01','m1','B','loss',1),
  entry('a2','a','2026-09-02','m2','B','draw',3),entry('b2','b','2026-09-02','m2','A','draw',0),
  entry('a3','a','2026-09-03','m3','A','win',0),entry('b3','b','2026-09-03','m3','A','win',4),
  entry('a4','a','2026-09-03','m4','B','loss',1),entry('b4','b','2026-09-03','m4','A','win',2),
  entry('alone','a','2026-09-04','m5','A','win',9),
  entry('duplicate','a','2026-09-01','m1','A','win',2),entry('own','a','2026-09-01','m1','A','win',1,{ownGoal:true})
];
const model=buildDataModel(players,logs);

test('shared match history intersects immutable player IDs and team membership',()=>{
  assert.deepEqual(computeSharedMatches(model,'a','b').map(r=>r.matchKey),['m4','m2','m1']);
  assert.deepEqual(computeSharedMatches(model,'a','b','together').map(r=>r.matchKey),['m3']);
});
test('shared match counts agree with the existing all-time head-to-head engine',()=>{
  for(const a of players)for(const b of players.filter(p=>p.id!==a.id)){
    const record=computeHeadToHead(model,a.id,b.id);
    assert.equal(computeSharedMatches(model,a.id,b.id).length,record.againstMatches);
    assert.equal(computeSharedMatches(model,a.id,b.id,'together').length,record.togetherMatches);
  }
});
test('goals are individual and own goals are separate; duplicates do not add appearances',()=>{
  const row=computeSharedMatches(model,'a','b').find(r=>r.matchKey==='m1');
  assert.equal(row.aGoals,2);assert.equal(row.bGoals,1);assert.equal(row.aOwnGoals,1);assert.equal(row.bOwnGoals,0);
  assert.equal(computeSharedMatches(model,'a','b').length,3);
});
test('reversing comparison swaps player columns without changing chronology',()=>{
  const ab=computeSharedMatches(model,'a','b'),ba=computeSharedMatches(model,'b','a');
  assert.deepEqual(ab.map(r=>r.matchKey),ba.map(r=>r.matchKey));
  for(let i=0;i<ab.length;i++){assert.equal(ab[i].aGoals,ba[i].bGoals);assert.equal(ab[i].aResult,ba[i].bResult);assert.equal(ab[i].aOwnGoals,ba[i].bOwnGoals);}
});
test('empty, unknown and self comparisons produce no fictitious shared matches',()=>{
  for(const m of [undefined,{},model])for(const ids of [['a','a'],['a','missing'],['','b']])assert.deepEqual(computeSharedMatches(m,...ids),[]);
  assert.deepEqual(computeSharedMatches(model,'a','b','unknown'),computeSharedMatches(model,'a','b'));
});
test('same-day matches stay separate, with deterministic newest-first order',()=>{
  const m=buildDataModel(players,[...logs,
    entry('a6','a','2026-09-03','m6','A','win',2,{createdAt:20}),entry('b6','b','2026-09-03','m6','B','loss',1,{createdAt:20})]);
  assert.deepEqual(computeSharedMatches(m,'a','b').slice(0,2).map(r=>r.matchKey),['m6','m4']);
});
test('recorded results are not silently inferred from a goal total or another player',()=>{
  const m=buildDataModel(players,[entry('x','a','2026-09-01','x','A','loss',8),entry('y','b','2026-09-01','x','B','loss',1)]);
  const row=computeSharedMatches(m,'a','b')[0];assert.equal(row.aResult,'loss');assert.equal(row.bResult,'loss');
});
test('shared history does not mutate the model and guards repeated canonical participations',()=>{
  const before=JSON.stringify({players,logs,parts:[...model.byPlayer],matches:[...model.matchSummaries]});
  computeSharedMatches(model,'a','b');computeSharedMatches(model,'a','b','together');
  assert.equal(JSON.stringify({players,logs,parts:[...model.byPlayer],matches:[...model.matchSummaries]}),before);
  const repeated={...model,byPlayer:new Map(model.byPlayer)};repeated.byPlayer.set('a',[...model.byPlayer.get('a'),...model.byPlayer.get('a')]);
  assert.deepEqual(computeSharedMatches(repeated,'a','b'),computeSharedMatches(model,'a','b'));
});

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const render=source.slice(source.indexOf('function renderComparisonMeetings('),source.indexOf('function computeHeadToHead('));
function runRenderer(lang='en',mode='against',limit=5,b='b'){
  const buttons=['against','together'].map(value=>({dataset:{meetingsMode:value},setAttribute(k,v){this[k]=v;}}));
  const nodes={comparisonMeetingsList:{innerHTML:''},comparisonMeetingsModes:{querySelectorAll:()=>buttons},comparisonMeetingsCount:{},btnMoreComparisonMeetings:{}};
  runInNewContext(render+'\nrenderComparisonMeetings();',{$:id=>nodes[id],model,currentProfileId:'a',comparisonPlayerId:b,comparisonMeetingsMode:mode,comparisonMeetingsLimit:limit,
    computeSharedMatches,paginateItems,language:lang,countText,esc,t:key=>translate(lang,key),playerName:id=>players.find(p=>p.id===id)?.name,formatMatchDate:v=>v,emptyState:(i,title)=>title});
  return {nodes,buttons,html:nodes.comparisonMeetingsList.innerHTML};
}
test('actual renderer uses recorded goals and outcomes, escaping names and match keys',()=>{
  for(const lang of ['ar','en']){
    const result=runRenderer(lang);
    assert.match(result.html,/Ali &lt;script&gt;/);assert.doesNotMatch(result.html,/<script>|NaN|undefined/);
    assert.equal((result.html.match(/data-open-match=/g)||[]).length,3);
    assert.ok(result.html.includes(translate(lang,'ownGoals')));assert.match(result.html,/meeting-outcome win/);
    assert.equal(result.nodes.comparisonMeetingsCount.textContent,countText(lang,3,'match'));
    assert.equal(result.buttons[0]['aria-pressed'],'true');assert.equal(result.nodes.btnMoreComparisonMeetings.hidden,true);
  }
});
test('pagination limits visible meetings but the counter covers the whole relationship',()=>{
  const result=runRenderer('en','against',1);
  assert.equal((result.html.match(/data-open-match=/g)||[]).length,1);assert.equal(result.nodes.btnMoreComparisonMeetings.hidden,false);
  assert.equal(result.nodes.comparisonMeetingsCount.textContent,'3 matches');
  const together=runRenderer('en','together');assert.equal(together.buttons[1]['aria-pressed'],'true');assert.equal(together.nodes.comparisonMeetingsCount.textContent,'1 match');
});
test('empty comparison histories have clear localized states and no details links',()=>{
  for(const mode of ['against','together'])for(const lang of ['ar','en']){
    const result=runRenderer(lang,mode,5,'c');assert.equal(result.html,translate(lang,mode==='against'?'noAgainstMatches':'noTogetherMatches'));
    assert.doesNotMatch(result.html,/data-open-match/);assert.equal(result.nodes.btnMoreComparisonMeetings.hidden,true);
  }
});
test('returning from a match restores comparison route, history mode, list length and focus',()=>{
  const code=source.slice(source.indexOf('function returnFromMatchHistory('),source.indexOf('function renderTeammates('));
  const context={screen:'playerprofile',hash:'#player/a/compare/b/recent',scrollY:1600,meetingsMode:'together',meetingsLimit:10,comparison:true,matchKey:'m3',trail:[{screen:'playerstats',hash:'#players'}]};
  let hash,scroll,focused=false,restored;
  const env={historyReturnContext:context,profileTrail:[],parseAppRoute,restoreProfileContext:v=>restored=v,window:{history:{pushState:(state,title,next)=>hash=next}},syncScreenFromLocation(){},requestAnimationFrame:fn=>fn(),restoreScrollPosition:y=>scroll=y,
    document:{querySelectorAll:()=>[{dataset:{openMatch:'m3'},focus:()=>focused=true}]}};
  runInNewContext(code+'\nreturnFromMatchHistory();',env);
  assert.equal(hash,context.hash);assert.equal(scroll,1600);assert.equal(focused,true);assert.equal(env.historyReturnContext,null);
  assert.equal(env.comparisonMeetingsMode,'together');assert.equal(env.comparisonMeetingsLimit,10);assert.deepEqual(env.profileTrail,context.trail);assert.equal(restored,context);
});
test('return action ignores missing or non-profile contexts',()=>{
  const code=source.slice(source.indexOf('function returnFromMatchHistory('),source.indexOf('function renderTeammates('));
  for(const context of [null,{hash:'#settings'},{hash:'#history'}])runInNewContext(code+'\nreturnFromMatchHistory();',{historyReturnContext:context,parseAppRoute});
});
test('meeting shortcut supports reduced motion and moves keyboard focus to the section',()=>{
  const shortcut=source.slice(source.indexOf('$("btnComparisonMeetings")?.addEventListener'),source.indexOf('$("playerSearch")?.addEventListener'));
  assert.match(shortcut,/prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
  assert.match(shortcut,/comparisonMeetingsTitle'\)\?\.focus\(\{preventScroll:true\}\)/);
  assert.match(source,/id="comparisonMeetingsTitle" tabindex="-1"/);
});
test('opening a meeting preserves context and scrolls its card below fixed headers',()=>{
  const code=source.slice(source.indexOf('function openHistoryMatch('),source.indexOf('function returnFromMatchHistory('));
  let scrolled=false,focused=false,screen;
  const button={dataset:{matchToggle:'m2'},closest:selector=>{assert.equal(selector,'.matchCard');return {scrollIntoView:()=>scrolled=true};},focus:()=>focused=true};
  const env={getSortedMatches:()=>[{matchKey:'m1'},{matchKey:'m2'}],document:{querySelector:()=>({id:'screen-playerprofile'}),querySelectorAll:()=>[button]},
    window:{location:{hash:'#player/a/compare/b/recent'},scrollY:800},comparisonOpen:true,comparisonMeetingsMode:'together',comparisonMeetingsLimit:10,showAllTeammates:false,partnershipSort:'matches',profileTrail:[{hash:'#players'}],
    $:()=>({value:''}),HISTORY_PAGE_SIZE:10,expandedMatchKeys:new Set(),showScreen:name=>screen=name,setActiveNav(){},requestAnimationFrame:fn=>fn()};
  runInNewContext(code+'\nopenHistoryMatch("m2");',env);
  assert.equal(env.historyReturnContext.hash,'#player/a/compare/b/recent');assert.equal(env.historyReturnContext.scrollY,800);assert.equal(env.historyReturnContext.matchKey,'m2');
  assert.equal(env.historyVisibleCount,10);assert.equal(env.expandedMatchKeys.has('m2'),true);assert.equal(screen,'history');assert.equal(scrolled,true);assert.equal(focused,true);
});
