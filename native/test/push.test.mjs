import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notificationRoute, notificationView, PUSH_CONSOLE_URL} from '../push-controls.js';
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
