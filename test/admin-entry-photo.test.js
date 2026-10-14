import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {isGoalAddition, goalAdditionSide, isOwnGoal, normalizeSide, normalizeResult} from '../data-engine.js';

// Actual handlers with inert local adapters: never connect to Firebase, create
// accounts, select production images or modify any real match entry.
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const handlers = app.slice(app.indexOf('const AVATAR_SELECTOR'), app.indexOf('function renderCompare()'));
function harness({admin = true, entry = {}, siblings = []} = {}) {
  const record = {id:'entry', playerId:'a', date:'2026-10-01', side:'A', result:'win', goals:2, ...entry};
  const values = {editPlayer:'a', editDate:'2026-10-01', editGoals:'3', editResult:'win', editSide:'A', editGoalType:'normal'};
  const nodes = new Map(Object.entries(values).map(([key,value]) => [key,{value}]));
  const writes = [], notices = [];
  const ctx = {
    isAdmin:admin, linkedPlayerId:null, editingEntryId:'entry', deletingEntryId:'',
    rawLogs:[record,...siblings], rawPlayers:[{id:'a', name:'Ali'},{id:'b', name:'Bader'}],
    players:[{id:'a',name:'Ali'},{id:'b',name:'Bader'}], db:{},
    $:id=>nodes.get(id), t:key=>key, notify:(...args)=>notices.push(args),
    isGoalAddition, goalAdditionSide, isOwnGoal, normalizeSide, normalizeResult,
    isValidISODate:value=>/^2026-\d{2}-\d{2}$/.test(value),
    compareRawLogsNewestFirst:(a,b)=>(b.createdAt||0)-(a.createdAt||0),
    doc:(_db,...parts)=>parts.join('/'),
    updateDoc:async (path,payload)=>writes.push({path,payload}),
    setButtonBusy(){}, closeModal(){}, console:{error(){}},
    URL:{createObjectURL(){throw Error('Invalid files must be rejected first');}},
  };
  runInNewContext(handlers,ctx);
  return {ctx, nodes, writes, notices, save:()=>ctx.saveEntryEdit({preventDefault(){}})};
}

test('photo controls allow only the administrator or the linked player', () => {
  const {ctx} = harness({admin:false});
  assert.equal(ctx.canEditPhoto('a'),false);
  ctx.linkedPlayerId = 'a';
  assert.equal(ctx.canEditPhoto('a'),true);
  assert.equal(ctx.canEditPhoto('b'),false);
  ctx.isAdmin = true;
  assert.equal(ctx.canEditPhoto('b'),true);
});

test('photo input rejects unsupported files and oversize images without database access', async () => {
  const h = harness();
  for (const file of [null,{type:'text/html',size:20},{type:'image/svg+xml',size:20}]) {
    await assert.rejects(h.ctx.readImageAsAvatar(file),/photoTypeError/);
  }
  await assert.rejects(h.ctx.readImageAsAvatar({type:'image/jpeg',size:13*1024*1024}),/photoSizeError/);
  assert.equal(h.writes.length,0);
});

test('non-administrators cannot submit entry edits', async () => {
  const h = harness({admin:false}); await h.save();
  assert.equal(h.writes.length,0);
});

test('entry edits reject negative, fractional, excessive and nonnumeric goals', async () => {
  for (const goals of ['-1','1.5','100','bad']) {
    const h = harness(); h.nodes.get('editGoals').value = goals; await h.save();
    assert.equal(h.writes.length,0); assert.equal(h.notices[0][0],'invalidGoals');
  }
});

test('additional-goal edits cannot change participation player, date, result or team', async () => {
  const h = harness({entry:{goalAddition:{side:'B'}}});
  h.nodes.get('editPlayer').value = 'b'; h.nodes.get('editDate').value = '2026-10-02';
  h.nodes.get('editResult').value = 'loss'; h.nodes.get('editSide').value = 'B';
  await h.save();
  assert.equal(h.writes.length,1); assert.equal(h.writes[0].path,'logs/entry');
  const payload = h.writes[0].payload;
  assert.deepEqual(Object.keys(payload).sort(),['createdAt','goalAddition','goals','ownGoal']);
  assert.equal(payload.goalAddition.side,'B'); assert.equal(payload.goals,3);
});

test('base edits reject duplicate normal entries and conflicting own-goal metadata', async () => {
  for (const ownGoal of [false,true]) {
    const h = harness({siblings:[{id:'other',playerId:'a',date:'2026-10-01',side:'B',result:'loss',ownGoal}]});
    await h.save(); assert.equal(h.writes.length,0);
    assert.equal(h.notices[0][0],ownGoal?'metadataMismatch':'duplicateEntry');
  }
});

test('valid entry edits merge only the existing football fields into the chosen document', async () => {
  const h = harness(); await h.save();
  assert.equal(h.writes.length,1); assert.equal(h.writes[0].path,'logs/entry');
  const payload = h.writes[0].payload;
  assert.deepEqual(Object.keys(payload).sort(),['createdAt','date','goals','ownGoal','playerId','result','side']);
  assert.equal(payload.playerId,'a'); assert.equal(payload.result,'win'); assert.equal(payload.goals,3);
});
