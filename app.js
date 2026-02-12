import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   Firebase Config
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  authDomain: "el-futbolistas.firebaseapp.com",
  projectId: "el-futbolistas",
  storageBucket: "el-futbolistas.appspot.com",
};

const PASSCODE = "0550";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");

/* =========================
   State
========================= */
let editMode = false;
let players = [];
let logs = [];

/* =========================
   Boot
========================= */
document.addEventListener("DOMContentLoaded", () => {
  mountAuthOverlay();
  setupNavigation();
  wireUIActions();
  listenFirestore();
});

/* =========================
   Auth Overlay
========================= */
function mountAuthOverlay(){
  const el = document.createElement("div");
  el.id = "authOverlay";
  el.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    display:flex; align-items:center; justify-content:center;
    padding:18px;
    background: rgba(0,0,0,.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  `;
  el.innerHTML = `
    <div style="
      width:min(460px, 100%);
      border-radius:18px;
      border:1px solid rgba(255,255,255,.14);
      background: rgba(12, 18, 32, .92);
      color:#eaf3ff;
      box-shadow: 0 20px 60px rgba(0,0,0,.55);
      padding:16px;
    ">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <div style="
          width:42px;height:42px;border-radius:14px;
          display:grid;place-items:center;
          background: linear-gradient(135deg, rgba(123,92,255,.22), rgba(53,230,178,.12));
          border:1px solid rgba(255,255,255,.12);
        ">⚽</div>
        <div>
          <div style="font-weight:950; font-size:16px;">Futbolista</div>
          <div style="opacity:.75; font-size:12px;">View for everyone · Edit needs code</div>
        </div>
      </div>

      <div style="opacity:.8; font-size:12px; margin:10px 0 6px;">Enter passcode to edit</div>
      <input id="passcodeInput" type="password" inputmode="numeric" placeholder="Passcode"
        style="
          width:100%;
          padding:12px 12px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(0,0,0,.22);
          color:#eaf3ff;
          outline:none;
        "
      />

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button id="btnViewOnly" style="
          flex:1; padding:12px; border-radius:14px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          color:#eaf3ff; font-weight:950; cursor:pointer;
        ">View only</button>

        <button id="btnUnlockEdit" style="
          flex:1; padding:12px; border-radius:14px;
          border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.10);
          color:#eaf3ff; font-weight:950; cursor:pointer;
        ">Unlock edit</button>
      </div>

      <div id="authMsg" style="margin-top:10px; font-size:12px; opacity:.75;"></div>
    </div>
  `;
  document.body.appendChild(el);

  const input = el.querySelector("#passcodeInput");
  const msg = el.querySelector("#authMsg");

  el.querySelector("#btnViewOnly").onclick = () => {
    editMode = false;
    el.remove();
    applyEditLock();
    renderAll();
  };

  el.querySelector("#btnUnlockEdit").onclick = () => {
    const v = (input.value || "").trim();
    if (v === PASSCODE) {
      editMode = true;
      el.remove();
      applyEditLock();
      renderAll();
    } else {
      msg.textContent = "Wrong code. Try again, or choose View only.";
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.querySelector("#btnUnlockEdit").click();
  });
}

/* =========================
   Navigation
========================= */
function setupNavigation(){
  const navButtons = Array.from(document.querySelectorAll(".navbtn"));
  const screens = Array.from(document.querySelectorAll(".screen"));

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.nav;
      screens.forEach(s => s.classList.add("hidden"));
      const target = document.getElementById(`screen-${name}`);
      if (target) target.classList.remove("hidden");

      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
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
   Wire UI buttons
========================= */
function wireUIActions(){
  const btnAddPlayer = document.getElementById("btnAddPlayer");
  const playerName = document.getElementById("playerName");

  if (btnAddPlayer && playerName) {
    btnAddPlayer.addEventListener("click", async () => {
      if (!editMode) return alert("View only");
      const name = (playerName.value || "").trim();
      if (!name) return alert("Enter a name");
      await addDoc(playersRef, { name, createdAt: Date.now() });
      playerName.value = "";
    });
  }

  const btnAddLog = document.getElementById("btnAddLog");
  if (btnAddLog) {
    btnAddLog.addEventListener("click", async () => {
      if (!editMode) return alert("View only");

      const dateEl = document.getElementById("logDate");
      const playerEl = document.getElementById("logPlayer");
      const goalsEl = document.getElementById("logGoals");
      const winEl = document.getElementById("logWin");

      const date = dateEl?.value || new Date().toISOString().slice(0,10);
      const playerId = playerEl?.value;
      const goals = Number(goalsEl?.value || 0);
      const win = (winEl?.value === "win");

      if (!playerId) return alert("Pick a player");

      await addDoc(logsRef, {
        playerId,
        goals: Math.max(0, Math.min(99, goals)),
        win,
        date,
        createdAt: Date.now()
      });

      if (goalsEl) goalsEl.value = "0";
    });
  }
}

function applyEditLock(){
  const toDisable = ["btnAddPlayer","btnAddLog","btnReset"];
  toDisable.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !editMode;
  });
}

/* =========================
   Stats engine
========================= */
function computeAllPlayerStats(){
  const out = Object.create(null);

  for (const p of players) out[p.id] = blankStats();

  // group logs by player
  const by = Object.create(null);
  for (const p of players) by[p.id] = [];
  for (const l of logs){
    if (by[l.playerId]) by[l.playerId].push(l);
  }

  for (const p of players){
    const arr = (by[p.id] || []).slice().sort((a,b)=>{
      const da = String(a.date||"");
      const db = String(b.date||"");
      if (da < db) return -1;
      if (da > db) return 1;
      return (a.createdAt||0) - (b.createdAt||0);
    });

    let goals=0, wins=0, matches=arr.length;
    for (const l of arr){
      goals += Number(l.goals||0);
      wins += l.win ? 1 : 0;
    }

    const winPct = matches ? wins/matches : 0;
    const gpm = matches ? goals/matches : 0;

    // best streak
    let best=0, run=0;
    for (const l of arr){
      if (l.win){ run++; best = Math.max(best, run); }
      else run=0;
    }

    // current streak (from last to first)
    const desc = arr.slice().reverse();
    let current=0;
    for (const l of desc){
      if (l.win) current++;
      else break;
    }

    out[p.id] = { goals, wins, matches, winPct, goalsPerMatch:gpm, currentStreak:current, bestStreak:best };
  }

  return out;
}

function blankStats(){
  return { goals:0, wins:0, matches:0, winPct:0, goalsPerMatch:0, currentStreak:0, bestStreak:0 };
}

function fmtPct(x){ return Number.isFinite(x) ? `${Math.round(x*100)}%` : "0%"; }
function fmtDec(x,d){ return Number.isFinite(x) ? x.toFixed(Math.max(0, Math.min(6, d|0))) : "0.00"; }
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   Render
========================= */
function renderAll(){
  fillPlayerDropdown();
  renderKPIs();
  renderDashboard();
  renderLogsList();
}

function fillPlayerDropdown(){
  const sel = document.getElementById("logPlayer");
  if (!sel) return;

  const current = sel.value;
  const options = players
    .slice()
    .sort((a,b) => (a.name||"").localeCompare(b.name||""))
    .map(p => `<option value="${p.id}">${escapeHtml(p.name||"")}</option>`)
    .join("");

  sel.innerHTML = options;
  if (current && players.some(p => p.id === current)) sel.value = current;
}

function renderKPIs(){
  const kpiPlayers = document.getElementById("kpiPlayers");
  const kpiLogs = document.getElementById("kpiLogs");
  if (kpiPlayers) kpiPlayers.textContent = String(players.length);
  if (kpiLogs) kpiLogs.textContent = String(logs.length);
}

function renderDashboard(){
  const statsById = computeAllPlayerStats();
  const podium = document.getElementById("podiumScorers");
  const topStreaks = document.getElementById("topStreaks");
  const topWinPct = document.getElementById("topWinPct");
  if (!podium || !topStreaks || !topWinPct) return;

  const rows = players.map(p => ({ p, s: statsById[p.id] || blankStats() }));

  // Podium top scorers
  const topGoals = rows.slice()
    .sort((a,b)=> (b.s.goals - a.s.goals) || (b.s.goalsPerMatch - a.s.goalsPerMatch))
    .slice(0,3);

  const medals = ["🥇","🥈","🥉"];
  podium.innerHTML = topGoals.map((x,i)=>`
    <div class="podium-card rank-${i+1}">
      <div class="podium-rank">${medals[i]}</div>
      <div class="podium-name">${escapeHtml(x.p.name||"")}</div>
      <div class="podium-big">${x.s.goals}</div>
      <div class="podium-sub">Goals · G/Match ${fmtDec(x.s.goalsPerMatch,2)}</div>
      <div class="podium-sub">Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches}</div>
    </div>
  `).join("") || `<div class="note">No data yet.</div>`;

  // Top 3 current streak
  const medal = (i)=> i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
  const topSt = rows.slice()
    .sort((a,b)=> (b.s.currentStreak - a.s.currentStreak) || (b.s.bestStreak - a.s.bestStreak))
    .slice(0,3);

  topStreaks.innerHTML = topSt.map((x,i)=>`
    <div class="item">
      <div>
        <div class="name">${medal(i)} ${escapeHtml(x.p.name||"")}</div>
        <div class="meta">Current: <b>${x.s.currentStreak}</b> · Best: <b>${x.s.bestStreak}</b> · Matches: <b>${x.s.matches}</b></div>
      </div>
      <div class="pills">
        <span class="pill warn">🔥 ${x.s.currentStreak}</span>
      </div>
    </div>
  `).join("") || `<div class="note">No data yet.</div>`;

  // Top 3 win% (min 2 matches)
  const topW = rows.slice()
    .filter(x => x.s.matches >= 2)
    .sort((a,b)=> (b.s.winPct - a.s.winPct) || (b.s.wins - a.s.wins) || (b.s.matches - a.s.matches))
    .slice(0,3);

  topWinPct.innerHTML = topW.map((x,i)=>`
    <div class="item">
      <div>
        <div class="name">${medal(i)} ${escapeHtml(x.p.name||"")}</div>
        <div class="meta">Win%: <b>${fmtPct(x.s.winPct)}</b> · Wins: <b>${x.s.wins}</b> · Matches: <b>${x.s.matches}</b> · G/Match: <b>${fmtDec(x.s.goalsPerMatch,2)}</b></div>
      </div>
      <div class="pills">
        <span class="pill good">🏆 ${fmtPct(x.s.winPct)}</span>
      </div>
    </div>
  `).join("") || `<div class="note">Need at least 2 matches per player.</div>`;
}

function renderLogsList(){
  const list = document.getElementById("logsList");
  if (!list) return;

  const html = logs.slice(0, 30).map(l => {
    const p = players.find(x => x.id === l.playerId);
    const name = p ? p.name : "(Unknown)";
    return `
      <div class="item">
        <div>
          <div class="name">${escapeHtml(name)} — ${l.win ? "✅ Win" : "❌ Loss"}</div>
          <div class="meta">${escapeHtml(l.date || "")} · Goals: <b>${Number(l.goals||0)}</b></div>
        </div>
        <div class="pills">
          <span class="pill ${l.win ? "good" : "bad"}">${l.win ? "🏆 Win" : "💥 Loss"}</span>
          ${editMode ? `<button class="ghost" onclick="window.__delLog('${l.id}')">Delete</button>` : ``}
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = html || `<div class="note">No entries yet.</div>`;
}

window.__delLog = async (id) => {
  if (!editMode) return alert("View only");
  await deleteDoc(doc(db, "logs", id));
};
