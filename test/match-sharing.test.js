import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildDataModel} from '../data-engine.js';
import {matchRouteFor,parseAppRoute,appRouteFor,normalizeProfileTab,filterMatches,paginateItems} from '../ux-utils.js';
import {nativeLinkRoute,sharedAppUrl} from '../platform-utils.js';
import {matchSharePayload} from '../detail-ui.js';
import {translate,countText} from '../i18n.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('match links round-trip opaque IDs without confusing two matches on the same date',()=>{
  for(const key of ['2026-09-28','match-two','تدريب الخميس','id?x=1&x=# %']) {
    const hash=matchRouteFor(key);
    assert.deepEqual(parseAppRoute(hash),{screen:'history',playerId:'',historyMatchKey:key});
    for(const origin of ['https://ftbll.live/','futbolista://app/']) assert.equal(nativeLinkRoute(origin+'?qa=1'+hash),hash);
    assert.equal(sharedAppUrl('capacitor://localhost/',hash,true),'https://ftbll.live/'+hash);
  }
  assert.notEqual(matchRouteFor('one'),matchRouteFor('two'));
  assert.equal(parseAppRoute('#history/player/a').historyPlayerId,'a');
  assert.equal(parseAppRoute('#history').historyMatchKey,undefined);
});
test('invalid match IDs and paths cannot select actions or escape native navigation',()=>{
  for(const key of ['',null,'a/b','a\u0000b','x'.repeat(1501),'\ud800']) assert.equal(matchRouteFor(key),'#history');
  for(const suffix of ['','/','/%xy','/%00','/a%2Fb','/a/extra','/'+ 'x'.repeat(1501)]) {
    assert.equal(parseAppRoute('#history/match'+suffix).screen,'dashboard');
    assert.equal(nativeLinkRoute('https://ftbll.live/#history/match'+suffix),null);
  }
  assert.equal(nativeLinkRoute('https://evil.test/#history/match/m1'),null);
});

const players=[{id:'a',name:'Ali'},{id:'b',name:'Bader'}];
const log=(id,playerId,side,goals,extra={})=>({id,playerId,side,goals,date:'2026-09-01',matchId:'m1',result:side==='A'?'win':'loss',...extra});
const model=buildDataModel(players,[log('a','a','A',2),log('b','b','B',1),log('own','a','A',1,{ownGoal:true}),log('extra','a','A',3,{goalAddition:{side:'B'}})]);
const match=model.matchSummaries.get('m1');
test('share summaries use canonical team scores, not personal goal totals or private ballot data',()=>{
  const original=JSON.stringify(match);
  for(const lang of ['ar','en']) {
    const payload=matchSharePayload({...match,privateBallots:{email:'private@example.test'}},lang,date=>date);
    assert.deepEqual(Object.keys(payload),['title','text','hash']);
    assert.equal(payload.text,`2026-09-01\n${translate(lang,'teamA')} 2 – 5 ${translate(lang,'teamB')}`);
    assert.equal(payload.hash,'#history/match/m1');
    assert.doesNotMatch(JSON.stringify(payload),/private|email|Ballots/);
  }
  assert.equal(JSON.stringify(match),original);
  assert.equal(matchSharePayload(null,'ar',String),null);
});

function sharing(overrides={}) {
  const events=[];
  const context={shareBusy:false,sharedAppUrl,isNativeApp:()=>false,window:{location:{href:'https://ftbll.live/?qa=1'}},
    document:{activeElement:{isConnected:true,closest:()=>null,focus:()=>events.push('focus')}},
    shareNativeContent:async()=>false,navigator:{},copyTextToClipboard:async url=>events.push(url),
    notify:message=>events.push(message),t:key=>key,console:{error:()=>events.push('error')},...overrides};
  const share=runInNewContext(extract('async function shareContent(','function shareMatch(')+'\nshareContent',context);
  return {share,context,events};
}
const payload={title:'Match',text:'2 – 1',hash:'#history/match/m1'};
test('repeated share taps open only one sheet and unlock after completion',async()=>{
  let finish,calls=0;
  const {share,context}=sharing({shareNativeContent:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
  const first=share(payload);await share(payload);assert.equal(calls,1);assert.equal(context.shareBusy,true);
  finish(true);await first;assert.equal(context.shareBusy,false);
  const next=share(payload);assert.equal(calls,2);finish(true);await next;
});
test('browser cancellation does not copy a link or show an error',async()=>{
  const {share,context,events}=sharing({navigator:{share:async()=>{throw {name:'AbortError'};}}});
  await share(payload);assert.deepEqual(events,['focus']);assert.equal(context.shareBusy,false);
});
test('native handled sharing never also triggers a browser sheet or clipboard',async()=>{
  const {share,events}=sharing({shareNativeContent:async()=>true,navigator:{share:()=>assert.fail('native handled')}});
  await share(payload);assert.deepEqual(events,['focus']);
});
test('web share failure falls back to a clean direct link and restores focus',async()=>{
  const {share,events}=sharing({navigator:{share:async()=>{throw Error('unavailable');}}});
  await share(payload);assert.deepEqual(events,['https://ftbll.live/#history/match/m1','linkCopied','focus']);
});
test('share failure unlocks retries and never focuses an obsolete hidden control',async()=>{
  const {share,context,events}=sharing({copyTextToClipboard:async()=>{throw Error('denied');},document:{activeElement:{isConnected:true,closest:()=>({}),focus:()=>assert.fail('hidden')}}});
  await share(payload);assert.equal(context.shareBusy,false);assert.deepEqual(events,['error','shareFailed']);
});

test('focused history ignores stale filters and selects only the requested match ID',()=>{
  const matches=[match,{...match,matchKey:'m2'}];
  const context={getSortedMatches:()=>matches,historyMatchKey:'m2',historyPlayerId:'absent',historyExactDate:'2001-01-01',filterMatches,playerName:()=>'',$:()=>({value:'absent'})};
  const filter=runInNewContext(extract('function getFilteredMatches(','function formatMatchWeekday(')+'\ngetFilteredMatches',context);
  assert.deepEqual(filter().map(m=>m.matchKey),['m2']);context.historyMatchKey='missing';assert.equal(filter().length,0);
});

test('a cold incoming match route survives data loading and browser back clears the focused match',()=>{
  let reset=0;
  const context={profileTrail:[],parseAppRoute,appRouteFor,matchRouteFor,normalizeProfileTab,historyPlayerId:'',historyMatchKey:'',
    window:{location:{hash:'#history/match/m1'},history:{replaceState:()=>assert.fail('already canonical')},scrollTo(){}},
    document:{querySelector:()=>({id:'screen-history'})},resetHistoryControls(){reset++;},showScreen(){},setActiveNav(){},requestAnimationFrame:fn=>fn()};
  const sync=runInNewContext(extract('function syncScreenFromLocation(','function updateLocationForScreen(')+'\nsyncScreenFromLocation',context);
  sync();assert.equal(context.historyMatchKey,'m1');assert.equal(reset,1);
  context.window.location.hash='#history';sync();assert.equal(context.historyMatchKey,'');assert.equal(reset,2);
  context.window.location.hash='#history/player/a';sync();assert.equal(context.historyPlayerId,'a');assert.equal(context.historyMatchKey,'');
});

test('single-match rendering is expanded, localized, shareable and handles missing records without fallback',()=>{
  for(const language of ['ar','en']) {
    const nodes=new Map();
    const $=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},classList:{toggle(){}},querySelectorAll:()=>[],innerHTML:''});return nodes.get(id);};
    const t=(key,params)=>translate(language,key,params);
    const context={$,historyMatchKey:'m1',historyReturnContext:null,historyPlayerId:'',historyInitialized:false,
      getSortedMatches:()=>[match],renderHistoryOptions(){},renderHistoryDateRail(){},getFilteredMatches:()=>[match],renderHistorySelection(){},
      t,language,emptyState:(icon,title,lead)=>`${title} ${lead}`,expandedMatchKeys:new Set(),historyVisibleCount:10,paginateItems,
      formatMatchWeekday:()=>'',formatMatchDate:String,formatMonthLabel:String,esc:String,countText,sideLines:()=>'<span>scorer</span>',playerName:()=>'',community:{historyMarkup:()=>'<section>MOTM result</section>',refreshHistory(){}}};
    const render=runInNewContext(extract('function renderMatchHistory(','function getSortedMatches(')+'\nrenderMatchHistory',context);
    render();const html=$('matchHistoryList').innerHTML;
    assert.match(html,/class="matchCard expanded"/);assert.match(html,/<div tabindex="-1" class="matchTop/);
    assert.match(html,/data-share-match="m1"/);assert.doesNotMatch(html,/history-month-heading|history-more/);
    assert.doesNotMatch(html,/data-match-view|data-match-panel|match-stats-panel|data-detail-view/);
    assert.match(html,/class="matchGrid"/);assert.equal((html.match(/<span>scorer<\/span>/g)||[]).length,2);
    assert.match(html,/MOTM result/);
    assert.equal($('historyTitle').textContent,t('matchDetails'));
    context.historyMatchKey='';context.expandedMatchKeys.add('m1');render();
    assert.match($('matchHistoryList').innerHTML,/aria-expanded="true"/);
    assert.doesNotMatch($('matchHistoryList').innerHTML,/data-match-view|match-stats-panel/);
    context.expandedMatchKeys.clear();render();assert.match($('matchHistoryList').innerHTML,/class="match-details" hidden/);
    context.historyMatchKey='m1';
    context.getFilteredMatches=()=>[];render();assert.ok($('matchHistoryList').innerHTML.includes(t('matchLinkMissing')));
    context.getSortedMatches=()=>[];render();assert.ok($('matchHistoryList').innerHTML.includes(t('matchLinkMissing')));
  }
});
