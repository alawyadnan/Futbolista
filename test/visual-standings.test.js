import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildRankingMetric,buildPlayerAvatar} from '../ux-utils.js';
import {translate} from '../i18n.js';

const row={id:'player-1',name:'Ali <script>',formPoints:3.5,winPct:.625,goals:12,gpm:1.5,wins:5,matches:8,curStreak:2,bestStreak:4,votingPoints:13,motmAwards:2,monthAwards:1,rank:1,formResults:['win']};
const expected={form:['form','3.5'],winPct:['winPct','63%'],goals:['goals','12'],gpm:['gpm','1.50'],wins:['wins','5'],matches:['matches','8'],curStreak:['currentStreak','2'],bestStreak:['bestWinStreak','4'],votingPoints:['votingPoints','13'],motmAwards:['motmAwards','2'],monthAwards:['monthAwards','1']};
test('every selectable standing emphasizes its own value with the existing precision',()=>{
  const before=structuredClone(row);
  for(const [key,[label,value]] of Object.entries(expected))assert.deepEqual(buildRankingMetric(row,key),{key,labelKey:label,value});
  assert.deepEqual(row,before);
  assert.equal(buildRankingMetric({...row,formPoints:4},'form').value,'4');
  assert.equal(buildRankingMetric({},'goals').value,'0');
  assert.equal(buildRankingMetric(row,'unknown').key,'form');
});
test('actual compact renderer preserves all detailed statistics and safe player links',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const render=source.slice(source.indexOf('function renderLeaderboard('),source.indexOf('function renderTable('));
  for(const key of Object.keys(expected)){
    const list={innerHTML:''};
    runInNewContext(render+'\nrenderLeaderboard();',{$:id=>id==='lbSort'?{value:key}:list,rankingRows:()=>({rows:[row],awardSort:['votingPoints','motmAwards','monthAwards'].includes(key),complete:true}),
      buildRankingMetric,buildPlayerAvatar,communityEnabled:true,t:k=>translate('en',k),esc:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;'),formatFormPoints:()=>3.5,renderFormDots:()=>'<span class="result-dots">W</span>',fmtPct:()=> '63%',fmt2:()=> '1.50'});
    assert.match(list.innerHTML,new RegExp(`data-primary-metric="${key}"`));
    assert.ok(list.innerHTML.includes(`>${expected[key][1]}</strong>`));
    assert.match(list.innerHTML,/Ali &lt;script&gt;/);
    assert.match(list.innerHTML,/data-open-player="player-1"/);
    assert.match(list.innerHTML,/leader-metrics/);
    for(const label of ['Voting points','MOTM','Monthly awards','Goals per Match','Matches'])assert.ok(list.innerHTML.includes(label),`${label} is retained`);
  }
});
test('details toggle is a reversible DOM-only operation with an accessible pressed state',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=source.indexOf('$("btnLeaderboardDetails")?.addEventListener');
  const block=source.slice(start,source.indexOf('$("tableSort")?.addEventListener',start));
  let callback,pressed='false',shown=false;
  const button={addEventListener:(_event,fn)=>{callback=fn;},getAttribute:()=>pressed,setAttribute:(_key,v)=>{pressed=v;}};
  runInNewContext(block,{$:id=>id==='btnLeaderboardDetails'?button:{classList:{toggle:(_key,v)=>{shown=v;}}}});
  callback();assert.equal(pressed,'true');assert.equal(shown,true);
  callback();assert.equal(pressed,'false');assert.equal(shown,false);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="btnLeaderboardDetails"[^>]*aria-pressed="false"[^>]*aria-controls="leaderboardList"/);
});
test('compact trend labels exist in both languages without duplicating their number',()=>{
  for(const lang of ['ar','en'])for(const type of ['wins','unbeaten','losses','winless','scoring','attendance','motm']){
    const key=`trendLabel_${type}`,label=translate(lang,key);
    assert.notEqual(label,key);assert.doesNotMatch(label,/\{count\}/);
  }
});
