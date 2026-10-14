import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notificationRoute, notificationView, PUSH_CONSOLE_URL,shouldIntroduceNotifications,createNotificationIntroduction} from '../push-controls.js';
const read = file => readFileSync(new URL('../'+file, import.meta.url), 'utf8');

test('notification navigation only opens explicitly allowed public screens', () => {
  for (const screen of ['dashboard','history','leaderboard']) assert.equal(notificationRoute(screen), `futbolista://app/#${screen}`);
  for (const screen of ['settings','matches','players','account','https://evil.test','javascript:alert(1)','../history','',null,undefined,{}]) assert.equal(notificationRoute(screen), null);
});
test('push preference never claims delivery readiness before native subscription succeeds', () => {
  assert.deepEqual(notificationView(), {label:'unavailable',action:'retry'});
  assert.deepEqual(notificationView({configured:true,permission:'prompt'}), {label:'off',action:'enable'});
  assert.deepEqual(notificationView({configured:true,permission:'denied',enabled:true,ready:true}), {label:'denied',action:'openSettings'});
  assert.deepEqual(notificationView({configured:true,permission:'granted',enabled:true}), {label:'connecting',action:'disable'});
  assert.deepEqual(notificationView({configured:true,permission:'granted',enabled:true,ready:true}), {label:'on',action:'disable'});
  assert.deepEqual(notificationView({configured:true,permission:'granted',enabled:true,failed:true}), {label:'failed',action:'enable'});
});
test('push configuration keeps consent explicit and excludes analytics and secrets', () => {
  const info=read('ios/App/App/Info.plist');
  assert.match(info, /FirebaseMessagingAutoInitEnabled<\/key><false\/>/);
  assert.match(info, /FIREBASE_ANALYTICS_COLLECTION_ENABLED<\/key><false\/>/);
  const code=read('ios/App/App/FutbolistaPush.swift');
  assert.doesNotMatch(code, /print\(|NSLog\(|import FirebaseFirestore|Auth\.auth/);
  assert.match(code, /guard enabled else \{ return \}/);
  assert.match(code, /unregisterForRemoteNotifications/);
  assert.match(code, /deleteToken/);
  assert.match(code, /unsubscribe\(fromTopic: topic\)/);
  assert.match(code, /subscribe\(toTopic: topic\)/);
  const project=read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(project, /FirebaseMessaging in Frameworks/);
  assert.doesNotMatch(project, /productName = FirebaseAnalytics/);
  assert.match(read('ios/App/App/PrivacyInfo.xcprivacy'), /CA92\.1/);
});
test('sending stays in the authenticated Firebase console, with no client send API', () => {
  assert.equal(PUSH_CONSOLE_URL, 'https://console.firebase.google.com/project/el-futbolistas/notification');
  const controls=read('push-controls.js');
  assert.match(controls, /#screen-settings/);
  assert.doesNotMatch(controls, /fetch\(|access_token|private_key|api\.push\.apple/);
  assert.match(controls, /textContent/);
  assert.doesNotMatch(controls, /innerHTML/);
});

const firstOpen={configured:true,permission:'prompt',enabled:false,ready:false,failed:false,introductionSeen:false};
function introductionHarness(overrides={}) {
  const calls=[],busy=[],states=[];
  let state={...firstOpen},onClose,opens=0,closes=0,errors=0;
  const push={
    enable:async()=>{calls.push('enable');state={...state,permission:'granted',enabled:true,ready:true,introductionSeen:true};},
    dismissIntroduction:async()=>{calls.push('defer');state={...state,introductionSeen:true};},
    getStatus:async()=>{calls.push('status');return state;},...overrides
  };
  const control=createNotificationIntroduction(push,{
    open:callback=>{opens++;onClose=callback;},close:()=>{closes++;onClose?.();},
    setBusy:value=>busy.push(value),onState:value=>states.push(value),onError:()=>errors++
  });
  return {control,push,calls,busy,states,get status(){return state;},get opens(){return opens;},get closes(){return closes;},get errors(){return errors;},dismiss:()=>onClose?.()};
}
test('first opening offers a choice without login, permission requests or device registration',()=>{
  const h=introductionHarness();
  for(let i=0;i<4;i++)h.control.update({...firstOpen});
  assert.equal(h.opens,1);assert.deepEqual(h.calls,[]);
  assert.equal(shouldIntroduceNotifications(firstOpen),true);
  for(const state of [undefined,null,{}, {...firstOpen,configured:false},{...firstOpen,introductionSeen:undefined},
    {...firstOpen,introductionSeen:true},{...firstOpen,enabled:true},
    ...['granted','denied','unknown'].map(permission=>({...firstOpen,permission}))]){
    assert.equal(shouldIntroduceNotifications(state),false);
    const excluded=introductionHarness();excluded.control.update(state);assert.equal(excluded.opens,0);assert.deepEqual(excluded.calls,[]);
  }
});
test('acceptance alone requests native permission once, despite repeated taps and close callbacks',async()=>{
  const h=introductionHarness();h.control.update(firstOpen);
  await Promise.all([h.control.accept(),h.control.accept(),h.control.defer()]);
  assert.deepEqual(h.calls,['enable','status']);assert.deepEqual(h.busy,[true,false]);
  assert.equal(h.closes,1);assert.equal(h.states[0].ready,true);
  h.control.update(firstOpen);assert.equal(h.opens,1);
});
test('not now persists the presentation decision without enabling notifications, including after app restart',async()=>{
  const h=introductionHarness();h.control.update(firstOpen);await h.control.defer();
  assert.deepEqual(h.calls,['defer','status']);assert.equal(h.status.permission,'prompt');assert.equal(h.status.enabled,false);
  const next=introductionHarness();next.control.update(h.status);assert.equal(next.opens,0);
});
test('Escape or closing the invitation is the same non-registering deferral',async()=>{
  const h=introductionHarness();h.control.update(firstOpen);h.dismiss();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(h.calls,['defer','status']);assert.equal(h.control.isFinished(),true);assert.equal(h.closes,1);
});
test('another modal or form delays the invitation without consuming the decision',()=>{
  const h=introductionHarness();h.control.update(firstOpen,false);assert.equal(h.opens,0);
  h.control.update(firstOpen,true);assert.equal(h.opens,1);assert.deepEqual(h.calls,[]);
});
test('native decisions arriving while the invitation is visible take precedence over stale taps',async()=>{
  const h=introductionHarness();h.control.update(firstOpen);
  h.control.update({...firstOpen,introductionSeen:true});await h.control.accept();
  assert.equal(h.closes,1);assert.deepEqual(h.calls,[]);
});
test('permission failure restores controls and does not keep prompting on status or resume',async()=>{
  const h=introductionHarness({enable:async()=>{throw Error('unavailable');}});h.control.update(firstOpen);await h.control.accept();
  assert.equal(h.errors,1);assert.deepEqual(h.busy,[true,false]);h.control.update(firstOpen);assert.equal(h.opens,1);
});
test('native introduction is stored locally and deferral cannot invoke Firebase or APNs',()=>{
  const source=read('ios/App/App/FutbolistaPush.swift');
  const method=source.slice(source.indexOf('    func dismissIntroduction()'),source.indexOf('    func consumeRoute()'));
  assert.match(method,/UserDefaults\.standard\.set\(true, forKey: introductionPreference\)/);
  assert.doesNotMatch(method,/register\(|configure\(|Messaging\.|requestAuthorization|FirebaseApp/);
  assert.match(source,/CAPPluginMethod\(name: "dismissIntroduction"/);
  assert.match(source,/"introductionSeen": UserDefaults\.standard\.bool/);
});
