import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildDataModel, computeHeadToHead} from '../data-engine.js';
import {computePartnerships} from '../insights-engine.js';
import {PROFILE_TABS,normalizeProfileTab,appRouteFor,parseAppRoute,buildPlayerAvatar} from '../ux-utils.js';
import {nativeLinkRoute} from '../platform-utils.js';
import {translate,countText} from '../i18n.js';

const players=[{id:'a',name:'Ali'}, {id:'b',name:'Bader <script>'}, {id:'c',name:'Cameron'}, {id:'d',name:'Dawood'}];
const row=(playerId,date,side,result,more={})=>({id:playerId+date,playerId,date,side,result,goals:1,...more});
const logs=[
  row('a','2026-09-01','A','win'),row('b','2026-09-01','A','win'),row('c','2026-09-01','B','loss'),
  row('a','2026-09-02','A','draw'),row('b','2026-09-02','A','draw'),
  row('a','2026-09-03','B','loss'),row('b','2026-09-03','B','loss'),row('c','2026-09-03','A','win'),
  row('a','2026-09-04','A','win'),row('c','2026-09-04','A','win'),
  row('a','2026-09-05','A','win'),row('c','2026-09-05','A','win'),
  row('b','2026-09-01','A','win',{id:'duplicate'}),row('b','2026-09-01','A','win',{id:'own',ownGoal:true,goals:3}),
  row('orphan','2026-09-01','A','win')
];
const model=buildDataModel(players,logs);
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const source=read('app.js');
const esc=v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;');

test('partnerships count only shared sides and exclude own-goal rows, duplicates and orphan profiles',()=>{
  const rows=computePartnerships(model,'a');
  assert.equal(rows.length,2);
  assert.deepEqual(rows.find(p=>p.playerId==='b'),{playerId:'b',matches:3,wins:1,draws:1,losses:1,winPct:1/3});
  assert.deepEqual(rows.find(p=>p.playerId==='c'),{playerId:'c',matches:2,wins:2,draws:0,losses:0,winPct:1});
  assert.deepEqual(computePartnerships(model,'d'),[]);
  assert.deepEqual(computePartnerships(model,'missing'),[]);
  assert.deepEqual(computePartnerships(undefined,'a'),[]);
});
test('every partner record matches the authoritative head-to-head calculation and is symmetric',()=>{
  for(const player of players)for(const part of computePartnerships(model,player.id)){
    const h2h=computeHeadToHead(model,player.id,part.playerId);
    assert.equal(part.matches,h2h.togetherMatches);assert.equal(part.wins,h2h.togetherWins);
    assert.equal(part.draws,h2h.togetherDraws);assert.equal(part.losses,h2h.togetherLosses);
    const reverse=computePartnerships(model,part.playerId).find(p=>p.playerId===player.id);
    assert.deepEqual({...part,playerId:player.id},reverse);
    assert.equal(part.matches,part.wins+part.draws+part.losses);
  }
});
test('same-day matches remain distinct and inconsistent results retain the existing loss policy',()=>{
  const m=buildDataModel(players,[row('a','2026-09-01','A','win',{matchId:'first'}),row('b','2026-09-01','A','win',{matchId:'first'}),row('a','2026-09-01','A','win',{matchId:'second'}),row('b','2026-09-01','A','draw',{matchId:'second'})]);
  assert.equal(computePartnerships(m,'a')[0].matches,2);
  assert.equal(computePartnerships(m,'a')[0].wins,1);
  assert.equal(computePartnerships(m,'a')[0].losses,1);
});
test('partner analysis does not mutate inputs and guards repeated canonical appearances',()=>{
  const before=JSON.stringify([...model.byMatch]);
  computePartnerships(model,'a');assert.equal(JSON.stringify([...model.byMatch]),before);
  const copy={...model,byPlayer:new Map(model.byPlayer)};
  copy.byPlayer.set('a',[...model.byPlayer.get('a'),...model.byPlayer.get('a')]);
  assert.deepEqual(computePartnerships(copy,'a'),computePartnerships(model,'a'));
});
test('actual partner renderer sorts by participation or raw shared wins without inventing ratings',()=>{
  const render=source.slice(source.indexOf('function renderTeammates('),source.indexOf('function renderMatchHistory('));
  for(const sort of ['matches','wins']){
    const nodes={profileMates:{classList:{toggle(){}},innerHTML:''},profileNever:{classList:{toggle(){}},innerHTML:''},partnershipSort:{value:''}};
    runInNewContext(render+'\nrenderTeammates("a");',{$:id=>nodes[id],model,players,computePartnerships,partnershipSort:sort,showAllTeammates:false,language:'en',countText,buildPlayerAvatar,esc,t:(k,v)=>translate('en',k,v),fmtPct:v=>Math.round(v*100)+'%',playerName:id=>model.playerById.get(id)?.name});
    const html=nodes.profileMates.innerHTML;
    assert.ok(html.indexOf('data-open-player="'+(sort==='matches'?'b':'c')+'"')<html.indexOf('data-open-player="'+(sort==='matches'?'c':'b')+'"'));
    assert.match(html,/Bader &lt;script&gt;/);assert.match(html,/3 matches/);assert.match(html,/33% wins/);
    assert.match(nodes.profileNever.innerHTML,/Dawood/);assert.doesNotMatch(html,/orphan/);
  }
});
test('profile sections round-trip through shareable and native links without changing old URLs',()=>{
  for(const tab of PROFILE_TABS){
    const hash=appRouteFor('playerprofile','لاعب ١',tab), parsed=parseAppRoute(hash);
    assert.equal(normalizeProfileTab(parsed.profileTab),tab);
    assert.equal(nativeLinkRoute('https://ftbll.live/'+hash),hash);
    assert.equal(nativeLinkRoute('futbolista://app/'+hash),hash);
  }
  assert.equal(appRouteFor('playerprofile','a'),'#player/a');
  assert.equal(appRouteFor('playerprofile','a','delete'),'#player/a');
  assert.equal(nativeLinkRoute('https://ftbll.live/#player/a/settings'),null);
  assert.equal(nativeLinkRoute('https://ftbll.live/#player/a/awards/delete'),null);
});
test('actual tab renderer exposes exactly one selected tab and panel; comparison temporarily hides all panels',()=>{
  const code=source.slice(source.indexOf('function renderProfilePanels('),source.indexOf('function selectProfileTab('));
  const nodes={profileTabs:{classList:{toggle(_key,value){this.hidden=value;}}}};
  for(const key of PROFILE_TABS){nodes['profile-tab-'+key]={setAttribute(_name,value){this.selected=value;}};nodes['profile-panel-'+key]={hidden:false};}
  for(const selected of PROFILE_TABS)for(const comparisonOpen of [false,true]){
    runInNewContext(code+'\nrenderProfilePanels();',{$:id=>nodes[id],PROFILE_TABS,currentProfileTab:selected,comparisonOpen});
    assert.equal(PROFILE_TABS.filter(key=>!nodes['profile-panel-'+key].hidden).length,comparisonOpen?0:1);
    assert.equal(nodes['profile-tab-'+selected].selected,'true');assert.equal(nodes['profile-tab-'+selected].tabIndex,0);
    assert.equal(nodes.profileTabs.classList.hidden,comparisonOpen);
  }
});
test('tab keyboard navigation respects RTL, wraps and supports Home/End',()=>{
  const start=source.indexOf('$("profileTabs")?.addEventListener(\'keydown\'');
  const code=source.slice(start,source.indexOf("$('partnershipSort')?.addEventListener",start));
  for(const language of ['en','ar']){
    let callback,next,prevented=0;
    runInNewContext(code,{$:()=>({addEventListener(_e,cb){callback=cb;}}),PROFILE_TABS,language,selectProfileTab:value=>{next=value;}});
    const event=(key,tab)=>({key,target:{closest:()=>({dataset:{profileTab:tab}})},preventDefault(){prevented++;}});
    callback(event(language==='ar'?'ArrowLeft':'ArrowRight','overview'));assert.equal(next,'awards');
    callback(event(language==='ar'?'ArrowRight':'ArrowLeft','overview'));assert.equal(next,'partners');
    callback(event('Home','partners'));assert.equal(next,'overview');callback(event('End','overview'));assert.equal(next,'partners');
    assert.equal(prevented,4);
  }
});
test('every section keeps its existing content exactly once and exposes valid ARIA references',()=>{
  const html=read('index.html');
  for(const id of ['profileStatsGrid','profileRecord','profileForm','profileHighlights','profileInsights','profileMatches','profileMates','profileNever','btnPlayerHistory','btnPinPlayer'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
  for(const tab of PROFILE_TABS){assert.ok(html.includes(`aria-controls="profile-panel-${tab}"`));assert.ok(html.includes(`aria-labelledby="profile-tab-${tab}"`));}
  for(const lang of ['ar','en'])for(const key of ['profileSections','profileOverview','profileAwards','profilePartners','playedTogetherTitle','mostSharedWins','winsTogether','sharedWinPct'])assert.notEqual(translate(lang,key,{percent:'50%'}),key);
});

test('opening and returning from a teammate remembers expanded rows and sort order',()=>{
  const open=source.slice(source.indexOf('function openProfile('),source.indexOf('function renderPlayerProfile('));
  const restore=source.slice(source.indexOf('function restoreProfileContext('),source.indexOf('function showScreen('));
  const context={document:{querySelector:()=>({id:'screen-playerprofile'})},window:{location:{hash:'#player/a/partners'},scrollY:900},
    profileTrail:[],currentProfileId:'a',showAllTeammates:true,partnershipSort:'wins',showScreen(){},setActiveNav(){}};
  runInNewContext(open+'\nopenProfile("b");',context);
  assert.equal(context.showAllTeammates,false);
  assert.equal(context.profileTrail[0].showAllTeammates,true);
  runInNewContext(restore+'\nrestoreProfileContext(profileTrail[0]);',context);
  assert.equal(context.showAllTeammates,true);assert.equal(context.partnershipSort,'wins');
});
