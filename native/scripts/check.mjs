import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFile(join(root,path),'utf8');
const config=JSON.parse(await read('capacitor.config.json'));
assert.equal(config.appId,'live.ftbll.futbolista');
assert.equal(config.webDir,'www');
assert.equal(config.server,undefined,'Packaged app must not use a live website server');
assert.equal(config.loggingBehavior,'debug');
const pkg=JSON.parse(await read('package.json'));
assert.equal(pkg.dependencies.firebase,'10.12.2','Use the same SDK as the current website');
const html=await read('www/index.html');
assert.match(html,/Content-Security-Policy/);
assert.doesNotMatch(html,/<script[^>]+src="https?:/);
assert.match(html,/src="\.\/app.bundle.js"/);
const info=await read('ios/App/App/Info.plist');
assert.match(info,/<string>futbolista<\/string>/);
assert.doesNotMatch(info,/NSAllowsArbitraryLoads|NSCameraUsageDescription|NSMicrophoneUsageDescription|NSLocation/);
const privacy=await read('ios/App/App/PrivacyInfo.xcprivacy');
assert.match(privacy,/NSPrivacyAccessedAPICategoryFileTimestamp/);assert.match(privacy,/C617\.1/);
assert.match(await read('ios/App/App.xcodeproj/project.pbxproj'),/PrivacyInfo.xcprivacy in Resources/);
const icon=await readFile(join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
assert.equal(icon.readUInt32BE(16),1024);assert.equal(icon.readUInt32BE(20),1024);assert.equal(icon[25],2,'App icon must be RGB without alpha');
let count=0;
async function verifyAssets(directory=''){
  for(const file of await readdir(join(root,'www',directory),{withFileTypes:true})){
    const path=join(directory,file.name);
    if(file.isDirectory())await verifyAssets(path);
    else{assert.ok((await readFile(join(root,'www',path))).equals(await readFile(join(root,'ios/App/App/public',path))),`Run sync: ${path}`);count++;}
  }
}
await verifyAssets();
const build=JSON.parse(await read('build-report.json'));
assert.equal(build.remoteJavaScript,false);
const xcode=spawnSync('xcodebuild',['-version'],{encoding:'utf8'});
// Source checks cannot attest to a native build or signature. Keep those unknown
// here rather than overwriting evidence from a separately observed Xcode build.
console.log(JSON.stringify({scope:'source-and-assets-only',sourceAndPackagedAssets:'passed',copiedAssets:count,xcodeAvailable:xcode.status===0,compiledIOS:'not-checked',signedIPA:'not-checked',storeReady:false,releaseBlockers:['Validate this update on the owner’s physical iPhone','Create a signed Release archive and obtain owner approval before upload']},null,2));
if(process.argv.includes('--release'))process.exitCode=1;
