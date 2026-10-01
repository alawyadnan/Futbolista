// Isolated scroll regression fixture. Uses the real table renderer and CSS;
// no Firebase, accounts, network data, persistence or production writes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '../../outputs/table-scroll-500416');
await mkdir(output, { recursive: true });
const source = await readFile(resolve(root, 'app.js'), 'utf8');
const index = await readFile(resolve(root, 'index.html'), 'utf8');
const css = await readFile(resolve(root, 'styles.css'), 'utf8');
const renderer = source.slice(source.indexOf('function renderTable()'), source.indexOf('function renderPlayerCardsNameOnly()'));
const table = index.match(/<section id="screen-table"[\s\S]*?<\/section>/)[0].replace('screen hidden', 'screen');
const modes = ['before', 'after'];
// Capture the original stylesheet only once, before editing it.
try { await writeFile(resolve(output, 'before.css'), css, { flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
for (const language of ['ar', 'en']) for (const mode of modes) {
  const cssURL = mode === 'before' ? './before.css' : '/work/Futbolista-next-update/styles.css';
  const html = `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Table scroll ${mode} ${language} — isolated test</title><link rel="stylesheet" href="${cssURL}"></head>
  <body><header class="topbar"><strong>Futbolista</strong><span>${mode} · ${language}</span></header>
  <main class="app"><p class="emulator-notice">Local test only — 65 synthetic players, no database connection</p>${table}</main>
  <script type="module">
  import { translate, directionFor } from '/work/Futbolista-next-update/i18n.js?v=500416';
  import { filterRankingRows, captureTableScrollPosition, restoreTableScrollPosition } from '/work/Futbolista-next-update/ux-utils.js?v=500416';
  const language='${language}';
  const $=id=>document.getElementById(id), t=(key,vars)=>translate('${language}',key,vars);
  const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const fmtPct=value=>Math.round(value*100)+'%', fmt2=value=>Number(value).toFixed(2);
  const communityEnabled=true, AWARD_SORT_KEYS=['votingPoints','motmAwards','monthAwards'];
  const rows=Array.from({length:65},(_,i)=>({id:'fixture-'+i,displayRank:i+1,rank:i+1,name:('${language}'==='ar'?'لاعب اختبار ':'Test player ')+String(i+1).padStart(2,'0'),matches:30,wins:20-i%18,goals:40-i%30,winPct:(20-i%18)/30,gpm:(40-i%30)/30,curStreak:i%4,bestStreak:5,votingPoints:100-i,motmAwards:i%8,monthAwards:i%3}));
  const rankingRows=key=>({rows:[...rows].sort((a,b)=>key==='name'?a.name.localeCompare(b.name):b[key]-a[key]),awardSort:AWARD_SORT_KEYS.includes(key),complete:true,pending:false,error:null});
  function renderRankingShortcuts(){} function rankingStatus(){return '';}
  ${renderer}
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  $('tableSearch').addEventListener('input',renderTable);$('tableSort').addEventListener('change',()=>{renderTable();restoreTableScrollPosition(document.querySelector('.tablewrap'),directionFor(language));});renderTable();
  </script></body></html>`;
  await writeFile(resolve(output, `${mode}-${language}.html`), html);
}
console.log(output);
