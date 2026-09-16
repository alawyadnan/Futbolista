import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('native container uses packaged assets and does not weaken transport security',()=>{
  const config=JSON.parse(read('capacitor.config.json'));
  assert.equal(config.server,undefined);assert.equal(config.webDir,'www');
  assert.equal(config.appId,'live.ftbll.futbolista');assert.equal(config.loggingBehavior,'debug');
  assert.doesNotMatch(read('ios/App/App/Info.plist'),/NSAllowsArbitraryLoads/);
});
test('Firebase browser and bundled versions match without changing the production project',()=>{
  const pkg=JSON.parse(read('package.json'));
  const source=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
  assert.equal(pkg.dependencies.firebase,'10.12.2');
  assert.match(source,/firebasejs\/10\.12\.2\//);assert.match(source,/projectId: "el-futbolistas"/);
});
test('native build has no external JavaScript imports or production service worker',()=>{
  const report=JSON.parse(read('build-report.json'));
  assert.equal(report.remoteJavaScript,false);
  for(const output of report.outputs)for(const dependency of output.imports){
    assert.notEqual(dependency.external,true);
    assert.doesNotMatch(dependency.path,/^(https?:)?\/\//);
    assert.ok(report.outputs.some(asset=>asset.path===dependency.path),'Every import must be another bundled asset');
  }
  assert.doesNotMatch(read('www/app.bundle.js'),/navigator\.serviceWorker\.register/);
});
test('CSP allows only the exact inline bootstrap hash, without unsafe eval or inline scripts',()=>{
  const html=read('www/index.html');
  const content=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const sha=createHash('sha256').update(content).digest('base64');
  const scripts=html.match(/script-src ([^;]+);/)[1];
  assert.ok(scripts.includes(`'sha256-${sha}'`));assert.doesNotMatch(scripts,/unsafe-inline|unsafe-eval|https?:/);
});
test('project includes required privacy reasons and a shared archive scheme',()=>{
  assert.match(read('ios/App/App/PrivacyInfo.xcprivacy'),/C617\.1/);
  const project=read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(project,/PrivacyInfo.xcprivacy in Resources/);
  assert.match(read('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'),/ArchiveAction buildConfiguration="Release"/);
  assert.equal(existsSync(new URL('../ios/App/App/AppDelegate.swift',import.meta.url)),true);
});
test('store-readiness command does not mistake bundled JavaScript for a signed iOS build',()=>{
  const checker=read('scripts/check.mjs');
  assert.match(checker,/scope:'source-and-assets-only'/);
  assert.match(checker,/compiledIOS:'not-checked'/);assert.match(checker,/signedIPA:'not-checked'/);assert.match(checker,/storeReady:false/);
  assert.match(checker,/includes\('--release'\)\)process.exitCode=1/);
});
