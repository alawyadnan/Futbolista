import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataModel } from '../data-engine.js';
import { computeMatchBreakdown, computeMonthlyPerformance } from '../insights-engine.js';
import { TABLE_VIEWS, resolveTableView, applyTableColumns, renderMonthlyPerformance, renderScoringLeaders } from '../detail-ui.js';
import { translate } from '../i18n.js';

const players = [{id:'a',name:'Ali <script>'},{id:'b',name:'Bader'},{id:'c',name:'Long Name'}];
const entry = (id, playerId, side, goals, extra = {}) => ({id,playerId,side,goals,date:'2026-09-03',result:side === 'A'?'win':'loss',...extra});
const logs = [entry('a','a','A',2),entry('duplicate','a','A',2),entry('b','b','B',1),entry('c','c','A',0),
  entry('a-own','a','A',1,{ownGoal:true}),entry('extra','a','A',3,{goalAddition:{side:'B'}}),
  entry('extra-own','a','A',2,{ownGoal:true,goalAddition:{side:'B'}})];
const model = buildDataModel(players, logs);
const match = model.matchSummaries.get('2026-09-03');

test('match comparisons allocate both-side additions without duplicating appearances or scorers', () => {
  const actual = computeMatchBreakdown(match);
  assert.deepEqual(actual.a,{players:2,goals:2,scorers:1,ownGoalsFor:2});
  assert.deepEqual(actual.b,{players:1,goals:4,scorers:2,ownGoalsFor:1});
  assert.deepEqual(actual.contributors,[{playerId:'a',goals:5},{playerId:'b',goals:1}]);
  assert.equal(actual.a.goals + actual.a.ownGoalsFor, match.scoreA);
  assert.equal(actual.b.goals + actual.b.ownGoalsFor, match.scoreB);
  assert.equal(actual.normalGoals,6);
});
test('scoreless matches have zero scorers and do not fabricate a leading player', () => {
  const zero = buildDataModel(players,[entry('a','a','A',0,{result:'draw'}),entry('b','b','B',0,{result:'draw'})]);
  const stats = computeMatchBreakdown([...zero.matchSummaries.values()][0]);
  assert.deepEqual(stats.contributors,[]);
  assert.equal(stats.normalGoals,0);
  assert.equal(computeMatchBreakdown(null).a.players,0);
});
test('monthly rows preserve one participation, recorded results and all personal normal goals', () => {
  const rows = computeMonthlyPerformance(model,'a');
  assert.deepEqual(rows,[{month:'2026-09',matches:1,wins:1,draws:0,losses:0,goals:5,winPct:1,gpm:5}]);
});
test('monthly rows are newest first across years, without inventing absent months', () => {
  const m = buildDataModel(players,[entry('a','a','A',0,{date:'2025-12-01'}),entry('b','a','A',2,{date:'2026-02-01',result:'draw'}),entry('c','a','A',1,{date:'2026-02-01',matchId:'second',result:'loss'})]);
  const rows = computeMonthlyPerformance(m,'a');
  assert.deepEqual(rows.map(row=>row.month),['2026-02','2025-12']);
  assert.deepEqual([rows[0].matches,rows[0].draws,rows[0].losses,rows[0].goals],[2,1,1,3]);
  assert.equal(rows[1].goals,0);
  assert.deepEqual(computeMonthlyPerformance(m,'absent'),[]);
});
test('new insights never mutate canonical results, goals or participation order', () => {
  const before = JSON.stringify([model.stats,model.participations,match]);
  computeMatchBreakdown(match);computeMonthlyPerformance(model,'a');
  assert.equal(JSON.stringify([model.stats,model.participations,match]),before);
});
test('every selected statistic is visible and all-column mode is retained', () => {
  assert.equal(resolveTableView(undefined,'winPct'),'results');
  assert.equal(resolveTableView('results','goals'),'attack');
  assert.equal(resolveTableView('results','motmAwards'),'awards');
  assert.equal(resolveTableView('attack','gpm'),'attack');
  assert.equal(resolveTableView('awards','name'),'awards');
  assert.equal(resolveTableView('results','bestStreak'),'all');
  assert.equal(resolveTableView('all','goals'),'all');
  assert.equal(resolveTableView('awards','motmAwards',false),'results');
  assert.equal(resolveTableView('__proto__','goals'),'attack');
});
test('column presets preserve row data, frozen names and accessible control states', () => {
  for (const view of ['results','attack','awards','all']) {
    const cells = ['name','matches','wins','goals','gpm','winPct','votingPoints','motmAwards','monthAwards'].map(key=>({dataset:{sortKey:key},hidden:false}));
    const controls = ['results','attack','awards','all'].map(key=>({dataset:{tableView:key},setAttribute(name,value){this[name]=value;}}));
    const wrap = {dataset:{columnView:view}}, screen = {querySelectorAll:()=>controls};
    const table = {classList:{toggle(){}},closest:selector=>selector === '.screen'?screen:wrap,querySelectorAll:()=>cells};
    applyTableColumns(table,'name',true);
    assert.equal(cells[0].hidden,false);
    assert.deepEqual(cells.filter(cell=>!cell.hidden).map(cell=>cell.dataset.sortKey),view==='all'?cells.map(cell=>cell.dataset.sortKey):cells.map(cell=>cell.dataset.sortKey).filter(key=>key==='name'||TABLE_VIEWS[view].includes(key)));
    assert.equal(controls.find(control=>control['aria-pressed']==='true').dataset.tableView,view);
    applyTableColumns(table,'name',false);
    assert.equal(controls.find(control=>control.dataset.tableView==='awards').hidden,true);
    assert.equal(cells.find(cell=>cell.dataset.sortKey==='votingPoints').hidden,true);
  }
});
test('monthly views are localized and escaped', () => {
  for (const lang of ['ar','en']) {
    const monthly = renderMonthlyPerformance(model,'a',lang,()=>'<September>');
    assert.match(monthly,/&lt;September&gt;/);assert.match(monthly,/data-player-month="2026-09"/);
    assert.ok(monthly.includes(translate(lang,'monthByMonth')));
    assert.doesNotMatch(monthly,/<script>|NaN|Infinity/);
  }
});
test('long monthly history is available without an endless initial list', () => {
  const m=buildDataModel(players,Array.from({length:7},(_,i)=>entry(`m${i}`,'a','A',i,{date:`2026-0${i+1}-01`})));
  const html=renderMonthlyPerformance(m,'a','ar',month=>month);
  assert.equal((html.match(/data-player-month=/g)||[]).length,7);
  assert.equal((html.split('<details')[0].match(/data-player-month=/g)||[]).length,4);
  assert.equal(renderMonthlyPerformance(m,'missing','ar',String),'');
});
test('scoring leaders use shared goal ranks, safe names and nonzero scale for scoreless squads', () => {
  const rows = players.map((p,i)=>({p,s:{goals:i<2?8:3,gpm:1}}));
  const html = renderScoringLeaders(rows,'ar');
  assert.deepEqual([...html.matchAll(/scoring-leader-rank" aria-hidden="true">(\d+)/g)].map(m=>m[1]),['1','1','3']);
  assert.match(html,/Ali &lt;script&gt;/);
  const zero = renderScoringLeaders([{p:players[0],s:{goals:0,gpm:0}}],'en');
  assert.doesNotMatch(zero,/NaN|Infinity|featured/);
  assert.match(zero,/scoring-leader-rank" aria-hidden="true">—/);
});
