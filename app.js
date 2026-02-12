/* =========================
   HARD CACHE FIX (Service Worker)
   - This runs before anything else
========================= */
(async () => {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    // also nuke caches if any
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  } catch {}
})();

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   Firebase
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  authDomain: "el-futbolistas.firebaseapp.com",
  projectId: "el-futbolistas",
  storageBucket: "el-futbolistas.appspot.com",
};

const PASSCODE = "1234";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");

/* =========================
   State
========================= */
let players = [];
let logs = [];
let editMode = false;

const sessionKey = "futbolista_editMode";

/* =========================
   DOM refs
========================= */
const els = {
  btnExportTop: document.getElementById("btnExportTop"),
  navBtns: Array.from(document.querySelectorAll(".navbtn")),
  screens: Array.from(document.querySelectorAll(".screen")),

  dashTopScorers: document.getElementById("dashTopScorers"),
  dashTopStreaks: document.getElementById("dashTopStreaks"),
  dashTopWinPct: document.getElementById("dashTopWinPct"),
  kpiPlayers: document.getElementById("kpiPlayers"),
  kpiLogs: document.getElementById("kpiLogs"),

  lbSort: document.getElementById("lbSort"),
  leaderboardList: document.getElementById("leaderboardList"),

  tableSort: document.getElementById("tableSort"),
  tableBody: document.getElementById("tableBody"),

  playerName: document.getElementById("playerName"),
  btnAddPlayer: document.getElementById("btnAddPlayer"),
  playersList: document.getElementById("playersList"),

  logDate: document.getElementById("logDate"),
  logPlayer: document.getElementById("logPlayer"),
  logGoals: document.getElementById("logGoals"),
  logWin: document.getElementById("logWin"),
  btnAddLog: document.getElementById("btnAddLog"),
  logsList: document.getElementById("logsList"),

  btnExport: document.getElementById("btnExport"),
  fileImport: document.getElementById("fileImport"),
  btnReset: document.getElementById("btnReset"),
};

/* =========================
   Boot
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // default date
  if (els.logDate) els.logDate.value = new Date().toISOString().slice(0,10);

  // prompt (ensures it ALWAYS appears if not already unlocked)
  const saved = sessionStorage.getItem(sessionKey);
  if (saved === "1") {
    editMode = true;
  } else if (saved === "0") {
    editMode = false;
  } else {
    const entered = prompt("Enter passcode to edit (Cancel = view only)");
    editMode = (entered === PASSCODE);
    sessionStorage.setItem(sessionKey, editMode ? "1" : "0");
  }

  setupNavigation();
  setupUIActions();
  listenFirestore();
});

/* =========================
   Navigation
========================= */
function setupNavigation(){
  els.navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.nav;
      els.screens.forEach(s => s.classList.add("hidden"));
      const target = document.getElementById(`screen-${name}`);
      if (target) target.classList.remove("hidden");

      els.navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/* =========================
   UI actions
========================= */
function setupUIActions(){
  els.btnAddPlayer?.addEventListener("click", async () => {
    if (!editMode) return alert("View only");
    const name = (els.playerName.value || "").trim();
    if (!name) return alert("Enter a name");
    await addDoc(playersRef, { name, createdAt: Date.now() });
    els.playerName.value = "";
  });

  els.btnAddLog?.addEventListener("click", async () => {
    if (!editMode) return alert("View only");
    const playerId = els.logPlayer?.value;
    if (!playerId) return alert("Pick a player");

    const goals = clampInt(els.logGoals?.value, 0, 99);
    const win = (els.logWin?.value === "win");
    const date = els.logDate?.value || new Date().toISOString().slice(0,10);

    await addDoc(logsRef, { playerId, goals, win, date, createdAt: Date.now() });
  });

  els.lbSort?.addEventListener("change", renderAll);
  els.tableSort?.addEventListener("change", renderAll);

  els.btnExportTop?.addEventListener("click", exportJSON);
  els.btnExport?.addEventListener("click", exportJSON);

  els.fileImport?.addEventListener("change", async (e) => {
    if (!editMode) return alert("View only");
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { return alert("Invalid JSON"); }

    const ok = confirm("Replace ALL data with this import? This deletes current Firebase data.");
    if (!ok) return;

    await resetAllData(false);
    await importJSON(data);
    e.target.value = "";
    alert("Import done");
  });

  els.btnReset?.addEventListener("click", async () => {
    if (!editMode) return alert("View only");
    const ok = confirm("Delete ALL players and match entries? This cannot be undone.");
    if (!ok) return;
    await resetAllData(true);
  });
}

/* =========================
   Firestore listeners
========================= */
function listenFirestore(){
  onSnapshot(query(playersRef, orderBy("createdAt","asc")), snap => {
    players = [];
    snap.forEach(d => players.push({ id: d.id, ...d.data() }));
    renderAll();
  });

  onSnapshot(query(logsRef, orderBy("createdAt","desc")), snap => {
    logs = [];
    snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
    renderAll();
  });
}

/* =========================
   Stats
========================= */
function blankStats(){ return { matches:0, wins:0, goals:0, winPct:0, gpm:0, current:0, best:0 }; }

function computeAllStats(){
  const byId = Object.create(null);
  for (const p of players) byId[p.id] = blankStats();

  const grouped = Object.create(null);
  for (const p of players) grouped[p.id] = [];
  for (const l of logs) if (grouped[l.playerId]) grouped[l.playerId].push(l);

  for (const p of players) {
    const arr = (grouped[p.id] || []).slice().sort((a,b)=>{
      const da = String(a.date||"");
      const db = String(b.date||"");
      if (da < db) return -1;
      if (da > db) return 1;
      return (a.createdAt||0) - (b.createdAt||0);
    });

    const matches = arr.length;
    let wins=0, goals=0;
    for (const l of arr){ wins += l.win?1:0; goals += Number(l.goals||0); }

    const winPct = matches ? wins/matches : 0;
    const gpm = matches ? goals/matches : 0;

    let best=0, run=0;
    for (const l of arr){ if(l.win){ run++; best=Math.max(best,run);} else run=0; }

    let current=0;
    for (let i=arr.length-1;i>=0;i--){ if(arr[i].win) current++; else break; }

    byId[p.id] = { matches, wins, goals, winPct, gpm, current, best };
  }
  return byId;
}

/* =========================
   Render
========================= */
function renderAll(){
  if (els.kpiPlayers) els.kpiPlayers.textContent = String(players.length);
  if (els.kpiLogs) els.kpiLogs.textContent = String(logs.length);

  fillPlayerDropdown();

  const stats = computeAllStats();
  renderDashboard(stats);
  renderPlayersList(stats);
  renderLeaderboard(stats);
  renderTable(stats);
  renderLogs();
}

function fillPlayerDropdown(){
  if (!els.logPlayer) return;
  const current = els.logPlayer.value;
  const options = players
    .slice()
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
    .map(p=>`<option value="${p.id}">${escapeHtml(p.name||"")}</option>`)
    .join("");
  els.logPlayer.innerHTML = options;
  if (current && players.some(p=>p.id===current)) els.logPlayer.value = current;
}

function renderDashboard(stats){
  const rows = players.map(p=>({p, s: stats[p.id]||blankStats()}));

  const topGoals = rows.slice().sort((a,b)=> (b.s.goals-a.s.goals)||(b.s.gpm-a.s.gpm)).slice(0,3);
  els.dashTopScorers.innerHTML = topGoals.length
    ? topGoals.map((x,i)=>dashItem(`${medal(i)} ${escapeHtml(x.p.name)}`, `${x.s.goals} goals · G/Match ${fmt2(x.s.gpm)} · Win% ${fmtPct(x.s.winPct)}`)).join("")
    : `<div class="note">No data yet.</div>`;

  const topStreak = rows.slice().sort((a,b)=> (b.s.current-a.s.current)||(b.s.best-a.s.best)).slice(0,3);
  els.dashTopStreaks.innerHTML = topStreak.length
    ? topStreak.map((x,i)=>dashItem(`${medal(i)} ${escapeHtml(x.p.name)}`, `Current: ${x.s.current} · Best: ${x.s.best} · Matches: ${x.s.matches}`, "warn")).join("")
    : `<div class="note">No data yet.</div>`;

  const topWin = rows.filter(x=>x.s.matches>=2).sort((a,b)=> (b.s.winPct-a.s.winPct)||(b.s.wins-a.s.wins)).slice(0,3);
  els.dashTopWinPct.innerHTML = topWin.length
    ? topWin.map((x,i)=>dashItem(`${medal(i)} ${escapeHtml(x.p.name)}`, `Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches} · Goals ${x.s.goals}`, "good")).join("")
    : `<div class="note">Need at least 2 matches per player.</div>`;
}

function dashItem(title, meta, tone){
  const pillClass = tone === "good" ? "pill good" : tone === "warn" ? "pill warn" : "pill";
  const icon = tone === "good" ? "🏆" : tone === "warn" ? "🔥" : "⚽";
  return `
    <div class="item">
      <div>
        <div class="name">${title}</div>
        <div class="meta">${meta}</div>
      </div>
      <div class="pills"><span class="${pillClass}">${icon}</span></div>
    </div>`;
}

function renderPlayersList(stats){
  const html = players
    .slice()
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
    .map(p=>{
      const s = stats[p.id]||blankStats();
      return `
        <div class="item">
          <div>
            <div class="name">${escapeHtml(p.name||"")}</div>
            <div class="meta">
              Matches <b>${s.matches}</b> · Wins <b>${s.wins}</b> · Goals <b>${s.goals}</b> ·
              Win% <b>${fmtPct(s.winPct)}</b> · G/Match <b>${fmt2(s.gpm)}</b> ·
              Streak <b>${s.current}</b> (best ${s.best})
            </div>
          </div>
          ${editMode ? `<div class="pills"><button class="btn ghost" onclick="deletePlayer('${p.id}')">Delete</button></div>` : ``}
        </div>`;
    }).join("");

  els.playersList.innerHTML = html || `<div class="note">No players yet.</div>`;
}

function renderLeaderboard(stats){
  const sortBy = els.lbSort?.value || "winPct";
  const rows = buildRows(stats).sort(makeSorter(sortBy));

  els.leaderboardList.innerHTML = rows.length
    ? rows.map((r,i)=>`
      <div class="item">
        <div>
          <div class="name">${medal(i)} ${escapeHtml(r.name)}</div>
          <div class="meta">
            Matches <b>${r.matches}</b> · Wins <b>${r.wins}</b> · Goals <b>${r.goals}</b> ·
            Win% <b>${fmtPct(r.winPct)}</b> · G/Match <b>${fmt2(r.gpm)}</b> ·
            Streak <b>${r.curStreak}</b> (best ${r.bestStreak})
          </div>
        </div>
        <div class="pills">
          <span class="pill good">🏆 ${fmtPct(r.winPct)}</span>
          <span class="pill">⚽ ${r.goals}</span>
        </div>
      </div>
    `).join("")
    : `<div class="note">No players yet.</div>`;
}

function renderTable(stats){
  const sortBy = els.tableSort?.value || "winPct";
  const rows = buildRows(stats).sort(makeSorter(sortBy));

  if (!rows.length) {
    els.tableBody.innerHTML = `<tr><td colspan="9" class="noteCell">No players yet.</td></tr>`;
    return;
  }

  els.tableBody.innerHTML = rows.map((r,idx)=>`
    <tr>
      <td>${idx+1}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.matches}</td>
      <td>${r.wins}</td>
      <td>${r.goals}</td>
      <td>${fmtPct(r.winPct)}</td>
      <td>${fmt2(r.gpm)}</td>
      <td>${r.curStreak}</td>
      <td>${r.bestStreak}</td>
    </tr>
  `).join("");
}

function renderLogs(){
  const html = logs.slice(0,30).map(l=>{
    const p = players.find(x=>x.id===l.playerId);
    const name = p ? p.name : "(Unknown)";
    const win = !!l.win;
    return `
      <div class="item">
        <div>
          <div class="name">${escapeHtml(name)} — ${win ? "✅ Win" : "❌ Loss"}</div>
          <div class="meta">${escapeHtml(l.date||"")} · Goals: <b>${Number(l.goals||0)}</b></div>
        </div>
        <div class="pills">
          <span class="pill ${win ? "good" : "bad"}">${win ? "🏆 Win" : "💥 Loss"}</span>
          ${editMode ? `<button class="btn ghost" onclick="deleteLog('${l.id}')">Delete</button>` : ``}
        </div>
      </div>`;
  }).join("");

  els.logsList.innerHTML = html || `<div class="note">No entries yet.</div>`;
}

/* =========================
   CRUD / Backup
========================= */
window.deleteLog = async (id) => {
  if (!editMode) return alert("View only");
  await deleteDoc(doc(db,"logs",id));
};
window.deletePlayer = async (id) => {
  if (!editMode) return alert("View only");
  const ok = confirm("Delete this player?");
  if (!ok) return;
  await deleteDoc(doc(db,"players",id));
};

async function exportJSON(){
  const data = { exportedAt: new Date().toISOString(), players, logs };
  downloadJSON(data, `futbolista_backup_${new Date().toISOString().slice(0,10)}.json`);
}

async function importJSON(data){
  const pls = Array.isArray(data.players) ? data.players : [];
  const lgs = Array.isArray(data.logs) ? data.logs : [];

  for (const p of pls){
    const name = String(p.name||"").trim();
    if (!name) continue;
    await addDoc(playersRef, { name, createdAt: Date.now() });
  }

  const snap = await getDocs(playersRef);
  const nowPlayers = [];
  snap.forEach(d => nowPlayers.push({ id:d.id, ...d.data() }));

  const byName = Object.create(null);
  for (const p of nowPlayers){
    const key = (p.name||"").trim().toLowerCase();
    if (!key) continue;
    if (!byName[key]) byName[key] = p.id;
  }

  for (const l of lgs){
    const nameKey = String(l.playerName||"").trim().toLowerCase();
    const pid = (l.playerId && nowPlayers.some(p=>p.id===l.playerId)) ? l.playerId : byName[nameKey];
    if (!pid) continue;

    await addDoc(logsRef,{
      playerId: pid,
      goals: clampInt(l.goals,0,99),
      win: !!l.win,
      date: String(l.date||new Date().toISOString().slice(0,10)),
      createdAt: Date.now()
    });
  }
}

async function resetAllData(showAlert){
  const logsSnap = await getDocs(logsRef);
  const logIds = [];
  logsSnap.forEach(d=>logIds.push(d.id));
  for (const id of logIds) await deleteDoc(doc(db,"logs",id));

  const playersSnap = await getDocs(playersRef);
  const playerIds = [];
  playersSnap.forEach(d=>playerIds.push(d.id));
  for (const id of playerIds) await deleteDoc(doc(db,"players",id));

  if (showAlert) alert("All data deleted.");
}

/* =========================
   Helpers
========================= */
function buildRows(stats){
  return players.map(p=>{
    const s = stats[p.id]||blankStats();
    return {
      id:p.id, name:p.name||"",
      matches:s.matches, wins:s.wins, goals:s.goals,
      winPct:s.winPct, gpm:s.gpm,
      curStreak:s.current, bestStreak:s.best
    };
  });
}
function makeSorter(sortBy){
  if (sortBy === "name") return (a,b)=>(a.name||"").localeCompare(b.name||"");
  const key = ({
    winPct:"winPct", goals:"goals", gpm:"gpm", wins:"wins", matches:"matches",
    curStreak:"curStreak", bestStreak:"bestStreak"
  }[sortBy]) || "winPct";

  return (a,b)=>{
    const av = Number(a[key]||0);
    const bv = Number(b[key]||0);
    if (bv !== av) return bv-av;
    return (b.goals-a.goals) || (b.wins-a.wins) || (b.matches-a.matches) || (a.name||"").localeCompare(b.name||"");
  };
}
function clampInt(v,min,max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function fmtPct(x){ return `${Math.round((Number(x)||0)*100)}%`; }
function fmt2(x){ return (Number(x)||0).toFixed(2); }
function medal(i){ return i===0?"🥇":i===1?"🥈":i===2?"🥉":""; }
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
