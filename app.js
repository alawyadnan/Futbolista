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

const els = {
  btnExportTop: document.getElementById("btnExportTop"),

  // nav / screens
  navBtns: Array.from(document.querySelectorAll(".navbtn")),
  screens: Array.from(document.querySelectorAll(".screen")),

  // dashboard
  dashTopScorers: document.getElementById("dashTopScorers"),
  dashTopStreaks: document.getElementById("dashTopStreaks"),
  dashTopWinPct: document.getElementById("dashTopWinPct"),
  kpiPlayers: document.getElementById("kpiPlayers"),
  kpiLogs: document.getElementById("kpiLogs"),

  // leaderboard / table
  lbSort: document.getElementById("lbSort"),
  leaderboardList: document.getElementById("leaderboardList"),
  tableSort: document.getElementById("tableSort"),
  tableBody: document.getElementById("tableBody"),

  // players
  playerName: document.getElementById("playerName"),
  btnAddPlayer: document.getElementById("btnAddPlayer"),
  playersList: document.getElementById("playersList"),

  // matches
  logDate: document.getElementById("logDate"),
  logPlayer: document.getElementById("logPlayer"),
  logGoals: document.getElementById("logGoals"),
  logWin: document.getElementById("logWin"),
  btnAddLog: document.getElementById("btnAddLog"),
  logsList: document.getElementById("logsList"),

  // settings
  btnExport: document.getElementById("btnExport"),
  fileImport: document.getElementById("fileImport"),
  btnReset: document.getElementById("btnReset"),
};

const sessionKey = "futbolista_editMode";

/* =========================
   Boot
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // date default
  if (els.logDate) els.logDate.value = new Date().toISOString().slice(0,10);

  // restore mode if already unlocked this session
  editMode = sessionStorage.getItem(sessionKey) === "1";
  if (!editMode) {
    const entered = prompt("Enter passcode to edit (Cancel = view only)");
    if (entered === PASSCODE) {
      editMode = true;
      sessionStorage.setItem(sessionKey, "1");
      alert("Edit mode enabled");
    } else {
      editMode = false;
      sessionStorage.setItem(sessionKey, "0");
      alert("View mode only");
    }
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
   UI Actions
========================= */
function setupUIActions(){
  // Add player
  els.btnAddPlayer?.addEventListener("click", async () => {
    if (!editMode) return alert("View only");
    const name = (els.playerName.value || "").trim();
    if (!name) return alert("Enter a name");
    await addDoc(playersRef, { name, createdAt: Date.now() });
    els.playerName.value = "";
  });

  // Add log
  els.btnAddLog?.addEventListener("click", async () => {
    if (!editMode) return alert("View only");

    const playerId = els.logPlayer?.value;
    if (!playerId) return alert("Pick a player");

    const goals = clampInt(els.logGoals?.value, 0, 99);
    const win = (els.logWin?.value === "win");
    const date = els.logDate?.value || new Date().toISOString().slice(0,10);

    await addDoc(logsRef, {
      playerId,
      goals,
      win,
      date,
      createdAt: Date.now()
    });
  });

  // Sort change
  els.lbSort?.addEventListener("change", renderAll);
  els.tableSort?.addEventListener("change", renderAll);

  // Export
  els.btnExportTop?.addEventListener("click", exportJSON);
  els.btnExport?.addEventListener("click", exportJSON);

  // Import replace
  els.fileImport?.addEventListener("change", async (e) => {
    if (!editMode) return alert("View only");
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { return alert("Invalid JSON"); }

    const ok = confirm("Replace ALL data with this import? This will delete current Firebase data.");
    if (!ok) return;

    await resetAllData(false);
    await importJSON(data);
    e.target.value = "";
    alert("Import done");
  });

  // Reset
  els.btnReset?.addEventListener("click", async () => {
    if (!editMode) return alert("View only");
    const ok = confirm("Delete ALL players and match entries? This cannot be undone.");
    if (!ok) return;
    await resetAllData(true);
  });
}

/* =========================
   Firestore Listeners
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
   Stats Engine
========================= */
function computeAllStats(){
  const byId = Object.create(null);
  for (const p of players) byId[p.id] = blankStats();

  // group logs per player
  const grouped = Object.create(null);
  for (const p of players) grouped[p.id] = [];
  for (const l of logs) {
    if (grouped[l.playerId]) grouped[l.playerId].push(l);
  }

  for (const p of players) {
    const arr = (grouped[p.id] || []).slice().sort((a,b)=>{
      const da = String(a.date||"");
      const db = String(b.date||"");
      if (da < db) return -1;
      if (da > db) return 1;
      return (a.createdAt||0) - (b.createdAt||0);
    });

    const matches = arr.length;
    let wins = 0, goals = 0;
    for (const l of arr) {
      wins += l.win ? 1 : 0;
      goals += Number(l.goals || 0);
    }

    const winPct = matches ? wins / matches : 0;
    const gpm = matches ? goals / matches : 0;

    // best streak
    let best = 0, run = 0;
    for (const l of arr) {
      if (l.win) { run++; best = Math.max(best, run); }
      else run = 0;
    }

    // current streak
    let current = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].win) current++;
      else break;
    }

    byId[p.id] = { matches, wins, goals, winPct, gpm, current, best };
  }

  return byId;
}

function blankStats(){
  return { matches:0, wins:0, goals:0, winPct:0, gpm:0, current:0, best:0 };
}

/* =========================
   Render
========================= */
function renderAll(){
  // KPIs
  if (els.kpiPlayers) els.kpiPlayers.textContent = String(players.length);
  if (els.kpiLogs) els.kpiLogs.textContent = String(logs.length);

  // dropdown players
  fillPlayerDropdown();

  // computed stats
  const stats = computeAllStats();

  // dashboard
  renderDashboard(stats);

  // players page (THIS is what was missing before)
  renderPlayersList(stats);

  // leaderboard
  renderLeaderboard(stats);

  // table
  renderTable(stats);

  // recent entries
  renderLogs(stats);
}

function fillPlayerDropdown(){
  if (!els.logPlayer) return;
  const current = els.logPlayer.value;
  const options = players
    .slice()
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(p => `<option value="${p.id}">${escapeHtml(p.name||"")}</option>`)
    .join("");
  els.logPlayer.innerHTML = options;
  if (current && players.some(p => p.id === current)) els.logPlayer.value = current;
}

/* Dashboard */
function renderDashboard(stats){
  // Top scorers
  const rows = players.map(p => ({ p, s: stats[p.id] || blankStats() }));
  const topGoals = rows.slice().sort((a,b)=> (b.s.goals - a.s.goals) || (b.s.gpm - a.s.gpm)).slice(0,3);

  els.dashTopScorers.innerHTML = topGoals.length
    ? topGoals.map((x,i)=> dashItem(`${medal(i)} ${escapeHtml(x.p.name)}`, `${x.s.goals} goals · G/Match ${fmt2(x.s.gpm)} · Win% ${fmtPct(x.s.winPct)}`)).join("")
    : `<div class="note">No data yet.</div>`;

  // Top current streak
  const topStreak = rows.slice().sort((a,b)=> (b.s.current - a.s.current) || (b.s.best - a.s.best)).slice(0,3);
  els.dashTopStreaks.innerHTML = topStreak.length
    ? topStreak.map((x,i)=> dashItem(`${medal(i)} ${escapeHtml(x.p.name)}`, `Current: ${x.s.current} · Best: ${x.s.best} · Matches: ${x.s.matches}`, "warn")).join("")
    : `<div class="note">No data yet.</div>`;

  // Top win% (min 2 matches)
  const topWin = rows.filter(x=>x.s.matches>=2).sort((a,b)=> (b.s.winPct - a.s.winPct) || (b.s.wins - a.s.wins)).slice(0,3);
  els.dashTopWinPct.innerHTML = topWin.length
    ? topWin.map((x,i)=> dashItem(`${medal(i)} ${escapeHtml(x.p.name)}`, `Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches} · Goals ${x.s.goals}`, "good")).join("")
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
      <div class="pills">
        <span class="${pillClass}">${icon}</span>
      </div>
    </div>
  `;
}

/* Players list */
function renderPlayersList(stats){
  if (!els.playersList) return;

  const rows = players
    .slice()
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(p => {
      const s = stats[p.id] || blankStats();
      return `
        <div class="item">
          <div>
            <div class="name">${escapeHtml(p.name||"")}</div>
            <div class="meta">
              Matches: <b>${s.matches}</b> · Wins: <b>${s.wins}</b> · Goals: <b>${s.goals}</b> ·
              Win%: <b>${fmtPct(s.winPct)}</b> · Goals/Match: <b>${fmt2(s.gpm)}</b> ·
              Current Streak: <b>${s.current}</b> · Best: <b>${s.best}</b>
            </div>
          </div>
          ${editMode ? `
            <div class="pills">
              <button class="btn ghost" onclick="deletePlayer('${p.id}')">Delete</button>
            </div>
          ` : ``}
        </div>
      `;
    }).join("");

  els.playersList.innerHTML = rows || `<div class="note">No players yet.</div>`;
}

/* Leaderboard */
function renderLeaderboard(stats){
  if (!els.leaderboardList) return;

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

/* Table */
function renderTable(stats){
  if (!els.tableBody) return;

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

function buildRows(stats){
  return players.map(p=>{
    const s = stats[p.id] || blankStats();
    return {
      id: p.id,
      name: p.name || "",
      matches: s.matches,
      wins: s.wins,
      goals: s.goals,
      winPct: s.winPct,
      gpm: s.gpm,
      curStreak: s.current,
      bestStreak: s.best
    };
  });
}

function makeSorter(sortBy){
  const dir = -1; // desc for numeric
  return (a,b) => {
    if (sortBy === "name") return (a.name||"").localeCompare(b.name||"");
    const key = {
      winPct: "winPct",
      goals: "goals",
      gpm: "gpm",
      wins: "wins",
      matches: "matches",
      curStreak: "curStreak",
      bestStreak: "bestStreak"
    }[sortBy] || "winPct";
    const av = Number(a[key]||0);
    const bv = Number(b[key]||0);
    if (bv !== av) return (bv - av);
    // tie-breaker
    return (b.goals - a.goals) || (b.wins - a.wins) || (b.matches - a.matches) || (a.name||"").localeCompare(b.name||"");
  };
}

/* Recent entries */
function renderLogs(stats){
  if (!els.logsList) return;

  const html = logs.slice(0, 30).map(l => {
    const p = players.find(x => x.id === l.playerId);
    const name = p ? p.name : "(Unknown)";
    const win = !!l.win;

    return `
      <div class="item">
        <div>
          <div class="name">${escapeHtml(name)} — ${win ? "✅ Win" : "❌ Loss"}</div>
          <div class="meta">${escapeHtml(l.date || "")} · Goals: <b>${Number(l.goals||0)}</b></div>
        </div>
        <div class="pills">
          <span class="pill ${win ? "good" : "bad"}">${win ? "🏆 Win" : "💥 Loss"}</span>
          ${editMode ? `<button class="btn ghost" onclick="deleteLog('${l.id}')">Delete</button>` : ``}
        </div>
      </div>
    `;
  }).join("");

  els.logsList.innerHTML = html || `<div class="note">No entries yet.</div>`;
}

/* =========================
   CRUD helpers
========================= */
window.deleteLog = async function(id){
  if (!editMode) return alert("View only");
  await deleteDoc(doc(db, "logs", id));
};

window.deletePlayer = async function(id){
  if (!editMode) return alert("View only");
  const ok = confirm("Delete this player? (Their match entries will remain unless you reset all data.)");
  if (!ok) return;
  await deleteDoc(doc(db, "players", id));
};

/* =========================
   Export / Import / Reset
========================= */
async function exportJSON(){
  const data = {
    exportedAt: new Date().toISOString(),
    players,
    logs
  };
  downloadJSON(data, `futbolista_backup_${new Date().toISOString().slice(0,10)}.json`);
}

async function importJSON(data){
  // Expect {players, logs}
  const pls = Array.isArray(data.players) ? data.players : [];
  const lgs = Array.isArray(data.logs) ? data.logs : [];

  // Import players (new docs)
  for (const p of pls){
    const name = String(p.name || "").trim();
    if (!name) continue;
    await addDoc(playersRef, { name, createdAt: Date.now() });
  }

  // Re-fetch players so we can map names to new IDs (simple approach)
  const snap = await getDocs(playersRef);
  const nowPlayers = [];
  snap.forEach(d => nowPlayers.push({ id: d.id, ...d.data() }));

  const byName = Object.create(null);
  for (const p of nowPlayers){
    const key = (p.name||"").trim().toLowerCase();
    if (!key) continue;
    if (!byName[key]) byName[key] = p.id;
  }

  // Import logs
  for (const l of lgs){
    const nameKey = String(l.playerName || "").trim().toLowerCase();
    const pid = l.playerId && nowPlayers.some(p=>p.id===l.playerId) ? l.playerId : byName[nameKey];
    if (!pid) continue;

    await addDoc(logsRef, {
      playerId: pid,
      goals: clampInt(l.goals, 0, 99),
      win: !!l.win,
      date: String(l.date || new Date().toISOString().slice(0,10)),
      createdAt: Date.now()
    });
  }
}

async function resetAllData(showAlert){
  // delete logs then players
  const logsSnap = await getDocs(logsRef);
  const toDelLogs = [];
  logsSnap.forEach(d => toDelLogs.push(d.id));
  for (const id of toDelLogs){
    await deleteDoc(doc(db, "logs", id));
  }

  const playersSnap = await getDocs(playersRef);
  const toDelPlayers = [];
  playersSnap.forEach(d => toDelPlayers.push(d.id));
  for (const id of toDelPlayers){
    await deleteDoc(doc(db, "players", id));
  }

  if (showAlert) alert("All data deleted.");
}

/* =========================
   Utils
========================= */
function clampInt(v, min, max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function fmtPct(x){ return `${Math.round((Number(x)||0) * 100)}%`; }
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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
