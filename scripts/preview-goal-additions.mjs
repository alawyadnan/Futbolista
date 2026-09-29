// Isolated visual fixture: no Firebase SDK, authentication or persistence.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {buildDataModel} from '../data-engine.js';
import {countText,translate} from '../i18n.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'../../outputs/update-500415');
await mkdir(output,{recursive:true});
const source=await readFile(resolve(root,'app.js'),'utf8'),index=await readFile(resolve(root,'index.html'),'utf8');
const renderer=source.slice(source.indexOf('function sideLines('),source.indexOf('function renderPlayersAdmin('));
const formRenderer=source.slice(source.indexOf('function renderGoalAdditionForm('),source.indexOf('async function addGoalsSafely('));
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const players=[{id:'a',name:'لاعب اختبار أ'},{id:'b',name:'لاعب اختبار ب'}];
const logs=[{id:'a',playerId:'a',date:'2026-09-01',side:'A',result:'win',goals:2},
  {id:'b',playerId:'b',date:'2026-09-01',side:'B',result:'loss',goals:0},
  {id:'extra',playerId:'a',date:'2026-09-01',side:'A',result:'win',goals:1,goalAddition:{side:'B'}}];
const model=buildDataModel(players,logs),match=model.matchSummaries.get('2026-09-01');
for(const language of ['ar','en']){
  const t=(key,variables)=>translate(language,key,variables);
  const side=entries=>runInNewContext(renderer+'\nsideLines(entries)',{entries,language,countText,esc,t,playerName:id=>players.find(p=>p.id===id)?.name});
  let form=index.match(/<details class="card additional-goals-card"[\s\S]*?<\/details>/)[0].replace('data-admin="1"','open');
  form=form.replace(/(<[^>]*data-i18n="([^"]+)"[^>]*>)[^<]*/g,(_all,tag,key)=>tag+esc(t(key)));
  const dictionary=Object.fromEntries(['chooseRecordedMatch','selectPlayer','additionalKeepsResult','additionalNeedsAppearance','saving','saveAdditionalGoals','teamA','teamB','win','draw','loss'].map(key=>[key,t(key,{team:'{team}',result:'{result}'})]));
  const client=`const $=id=>document.getElementById(id),isAdmin=true,addGoalsBusy=false,isDataReady=()=>true;
    const dictionary=${JSON.stringify(dictionary)},t=(key,vars={})=>(dictionary[key]||key).replace(/\\{(\\w+)\\}/g,(_,name)=>vars[name]??'');
    const esc=${esc.toString()},model={byMatch:new Map(${JSON.stringify([...model.byMatch])}),matchSummaries:new Map(${JSON.stringify([...model.matchSummaries])}),playerById:new Map(${JSON.stringify([...model.playerById])})};
    const getSortedMatches=()=>[...model.matchSummaries.values()],playerName=id=>model.playerById.get(id)?.name||'',formatMatchDate=date=>date,teamLabel=side=>t('team'+side);
    ${formRenderer}
    renderGoalAdditionForm();$('extraGoalMatch').value='2026-09-01';renderGoalAdditionForm();$('extraGoalPlayer').value='a';renderGoalAdditionForm();
    $('extraGoalMatch').addEventListener('change',renderGoalAdditionForm);$('extraGoalPlayer').addEventListener('change',renderGoalAdditionForm);
    $('btnAddGoals').addEventListener('click',()=>{$('extraGoalRecord').textContent='Local visual fixture only — no writes.';});`;
  const html=`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Goal additions — isolated preview</title><link rel="stylesheet" href="/work/Futbolista-next-update/styles.css"></head><body><main class="app" style="padding-block:20px"><p class="emulator-notice">${language==='ar'?'معاينة اختبار محلية — غير متصلة بقاعدة البيانات':'Isolated test preview — no database connection'}</p>${form}<article class="matchCard"><h2>${esc(t('history'))}</h2><p class="note">${language==='ar'?'مثال: هدفان مع أ، وهدف إضافي مع ب. مشاركة واحدة وفوز كامل.':'Example: 2 goals for A, 1 additional goal for B. One appearance and one full win.'}</p><div class="matchGrid"><section class="teamBox winners"><div class="teamTitle"><span>${esc(t('teamA'))}</span><strong>${match.scoreA}</strong></div>${side(match.scorersA)}</section><section class="teamBox losers"><div class="teamTitle"><span>${esc(t('teamB'))}</span><strong>${match.scoreB}</strong></div>${side(match.scorersB)}</section></div></article></main><script>${client}</script></body></html>`;
  await writeFile(resolve(output,`goal-additions-${language}.html`),html);
}
console.log(output);
