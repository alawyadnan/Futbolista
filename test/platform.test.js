import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {nativeLinkRoute,sharedAppUrl,shareWasCancelled,backupFileName} from '../platform-utils.js';
import {observeConnectivity} from '../connectivity.js';
import {isNativeApp,shareNativeContent,exportNativeJSON,initializeNativeApp} from '../platform.js';

test('native shares always use the public site, not the device or development origin',()=>{
  for(const origin of ['capacitor://localhost/','http://localhost/','https://localhost/'])
    assert.equal(sharedAppUrl(origin,'#player/abc',true),'https://ftbll.live/#player/abc');
  assert.equal(sharedAppUrl('https://ftbll.live/?release=500407#dashboard','#table'), 'https://ftbll.live/#table');
});
test('native links accept only public routes and discard query parameters',()=>{
  for(const origin of ['https://ftbll.live/','futbolista://app/']){
    assert.equal(nativeLinkRoute(origin+'?emulator=1#player/abc/compare/def'),'#player/abc/compare/def');
    assert.equal(nativeLinkRoute(origin+'#history/player/abc'),'#history/player/abc');
    assert.equal(nativeLinkRoute(origin+'#account'),'#account');
  }
});
test('native links reject foreign origins, action URLs, admin routes and malformed IDs',()=>{
  for(const url of ['javascript:alert(1)','http://ftbll.live/#table','https://ftbll.live.evil.test/#table','https://evil.test/#table','https://ftbll.live:8443/#table','https://u:p@ftbll.live/#table','https://ftbll.live/delete#dashboard','futbolista://evil/#table','https://ftbll.live/#settings','https://ftbll.live/#matches','https://ftbll.live/#player/%xy','https://ftbll.live/#player/%00','https://ftbll.live/#player/a%2Fb','https://ftbll.live/#player/a/unknown'])assert.equal(nativeLinkRoute(url),null,url);
});
test('cancelled sharing is distinct from a plugin or network failure',()=>{
  assert.equal(shareWasCancelled({name:'AbortError'}),true);
  assert.equal(shareWasCancelled({message:'Share canceled'}),true);
  assert.equal(shareWasCancelled({message:'Permission denied'}),false);
  assert.equal(shareWasCancelled({message:'Share failed: cancelled network request'}),false);
});
test('web environment does not load native packages or touch platform APIs',async()=>{
  assert.equal(isNativeApp(),false);
  assert.equal(await shareNativeContent({url:'https://ftbll.live/'}),false);
  assert.equal(await exportNativeJSON('{}','backup.json'),false);
  await initializeNativeApp({onResume:()=>assert.fail('not native'),onRoute:()=>assert.fail('not native')});
});
test('connectivity emits changes once and detaches both listeners',()=>{
  const listeners=new Map(),changes=[],connection={onLine:true};
  const target={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{assert.equal(listeners.get(n),f);listeners.delete(n);}};
  const stop=observeConnectivity({target,connection,onChange:v=>changes.push(v)});
  listeners.get('online')();connection.onLine=false;listeners.get('offline')();listeners.get('offline')();connection.onLine=true;listeners.get('online')();
  assert.deepEqual(changes,[false,true,false]);stop();assert.equal(listeners.size,0);
});
test('unknown network state is not mislabeled as offline',()=>{
  const changes=[];observeConnectivity({target:{addEventListener(){}},connection:{},onChange:v=>changes.push(v)});
  assert.deepEqual(changes,[false]);
});
test('backup names cannot escape the private cache',()=>{
  assert.equal(backupFileName('2026-09-16'),'ftbll_backup_2026-09-16.json');
  for(const input of ['../../secret','2026-09-16/../../x','',undefined])assert.throws(()=>backupFileName(input));
});
test('native JSON export preserves exact bytes and deletes only its temporary cache file',async()=>{
  const source=readFileSync(new URL('../native/bridge.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('export async function shareJSON')).replace('export async','async');
  for(const fail of [false,true]){
    const calls=[],payload='{\n  "players": [],\n  "logs": []\n}',filename=backupFileName('2026-09-16');
    const context={Filesystem:{writeFile:async x=>{calls.push(['write',x]);return{uri:'file:///private/cache/'+filename};},deleteFile:async x=>calls.push(['delete',x])},Directory:{Cache:'CACHE'},Encoding:{UTF8:'utf8'},Share:{share:async x=>{calls.push(['share',x]);if(fail)throw Error('Share canceled');}}};
    const fn=runInNewContext(body+'\nshareJSON',context);
    if(fail)await assert.rejects(fn(payload,filename));else await fn(payload,filename);
    assert.deepEqual(calls.map(c=>c[0]),['write','share','delete']);
    assert.equal(calls[0][1].data,payload);assert.equal(calls[0][1].directory,'CACHE');
    assert.equal(calls[2][1].path,filename);assert.equal(calls[2][1].directory,'CACHE');
    calls.length=0;await assert.rejects(fn('{}','../data.json'));assert.equal(calls.length,0);
  }
});
test('iOS native export remains admin-only and preserves raw backup schema',async()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('async function exportJSON()'),source.indexOf('/* =========================================================\n   RESET'));
  const players=[{id:'p',name:'Original'}],logs=[{id:'l',ownGoal:true}];
  let payload,count=0;
  const context={isAdmin:false,isDataReady:()=>true,notify:()=>{},t:k=>k,isNativeApp:()=>true,rawPlayers:players,rawLogs:logs,localISODate:()=> '2026-09-16',backupFileName,exportBusy:false,updateDataActionState:()=>{},exportNativeJSON:async json=>{count++;payload=JSON.parse(json);}};
  const fn=runInNewContext(body+'\nexportJSON',context);
  await fn();assert.equal(count,0);context.isAdmin=true;await fn();
  assert.equal(count,1);assert.deepEqual(payload.players,players);assert.deepEqual(payload.logs,logs);
  assert.deepEqual(Object.keys(payload),['exportedAt','players','logs']);assert.equal(context.exportBusy,false);
});

test('native export ignores repeated taps until the original share has finished',async()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('async function exportJSON()'),source.indexOf('/* =========================================================\n   RESET'));
  let finish,count=0;
  const context={isAdmin:true,isDataReady:()=>true,notify:()=>{},t:k=>k,isNativeApp:()=>true,rawPlayers:[],rawLogs:[],localISODate:()=> '2026-09-16',backupFileName,exportBusy:false,updateDataActionState:()=>{},exportNativeJSON:()=>{count++;return new Promise(resolve=>{finish=resolve;});}};
  const fn=runInNewContext(body+'\nexportJSON',context);
  const first=fn();await fn();assert.equal(count,1);assert.equal(context.exportBusy,true);
  finish();await first;assert.equal(context.exportBusy,false);
});

test('native export failures restore controls and show a translated error',async()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('async function exportJSON()'),source.indexOf('/* =========================================================\n   RESET'));
  const messages=[],states=[];
  const context={isAdmin:true,isDataReady:()=>true,notify:(...args)=>messages.push(args),t:k=>k,isNativeApp:()=>true,rawPlayers:[],rawLogs:[],localISODate:()=> '2026-09-16',backupFileName,exportBusy:false,updateDataActionState:()=>states.push(context.exportBusy),exportNativeJSON:async()=>{throw Error('private native error');}};
  await runInNewContext(body+'\nexportJSON',context)();
  assert.deepEqual(states,[true,false]);assert.equal(context.exportBusy,false);
  assert.deepEqual(messages,[['exportFailed','error']]);
});
