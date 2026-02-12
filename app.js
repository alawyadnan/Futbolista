/* Sunday League Pro (No Assists) - localStorage version */
const STORAGE_KEY = "slp_v1";

const state = loadState();

const els = {
  subtitle: document.getElementById("subtitle"),

  // nav
  navButtons: Array.from(document.querySelectorAll(".navbtn")),
  screens: Array.from(document.querySelectorAll("[data-screen]")),

  // dashboard
  kpiPlayers: document.getElementById("kpiPlayers"),
  kpiLogs: document.getElementById("kpiLogs"),
  topScorers: document.getElementById("topScorers"),
  topStreaks: document.getElementById("topStreaks"),

  // players
  playerName: document.getElementById("playerName"),
  btnAddPlayer: document.getElementById("btnAddPlayer"),
  playersList: document.getElementById("playersList"),

  // logs
  logDate: document.getElementById("logDate"),
  logPlayer: document.getElementById("logPlayer"),
  logGoals: document.getElementById("logGoals"),
  logWin: document.getElementById("logWin"),
  btnAddLog: document.getElementById("btnAddLog"),
  logsList: document.getElementById("logsList"),

  // leaderboard
  sortBy: document.getElementById("sortBy"),
  minMatches: document.getElementById("minMatches"),
  leaderCards: document.getElementById("leaderCards"),
  // backup
  btnExport: document.getElementById("btnExport"),
  btnExport2: document.getElementById("btnExport2"),
  importFile: document.getElementById("importFile"),
  btnReset: document.getElementById("btnReset"),
};

init();

function init() {
  // default date
  els.logDate.valueAsDate = new Date();

  // nav
  els.navButtons.forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.nav));
  });

  // players
  els.btnAddPlayer.addEventListener("click", addPlayer);
  els.playerName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPlayer();
  });

  // logs
  els.btnAddLog.addEventListener("click", addLogEntry);

  // leaderboard controls
  els.sortBy.addEventListener("change", renderAll);
  els.minMatches.addEventListener("input", renderAll);

  // export/import/reset
  els.btnExport.addEventListener("click", exportJSON);
  els.btnExport2.addEventListener("click", exportJSON);
  els.importFile.addEventListener("change", importJSON);
  els.btnReset.addEventListener("click", resetAll);

  renderAll();
  showScreen("dashboard");
}

function showScreen(name) {
  // update buttons
  els.navButtons.forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  // show/hide screens
  els.screens.forEach(s => s.classList.add("hidden"));
  document.getElementById(`screen-${name}`).classList.remove("hidden");
}

function renderAll() {
  ensureUniquePlayerNames();
  saveState();

  const stats = computeAllPlayerStats();
  renderPlayers(stats);
  renderPlayerSelect();
  renderLogsList();
  renderLeaderboard(stats);
  renderDashboard(stats);
}

function addPlayer() {
  const name = (els.playerName.value || "").trim();
  if (!name) return alert("Enter a player name.");
  if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    return alert("Player already exists.");
  }
  state.players.push({ id: uid(), name });
  els.playerName.value = "";
  renderAll();
}

function removePlayer(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;
  if (!confirm(`Remove ${p.name}? This won't delete their logs.`)) return;
  state.players = state.players.filter(x => x.id !== playerId);
  renderAll();
}

function addLogEntry() {
  if (state.players.length === 0) return alert("Add players first.");

  const date = els.logDate.value;
  const playerId = els.logPlayer.value;
  const goals = clampInt(els.logGoals.value, 0, 99);
  const win = els.logWin.value === "win";

  if (!date) return alert("Pick a date.");
  if (!playerId) return alert("Pick a player.");

  const playerStats = computeAllPlayerStats();
  const currentStreak = playerStats[playerId]?.currentStreak ?? 0;

  // streak rule
  const streakCounter = win ? (currentStreak + 1) : 0;

  state.logs.unshift({
    id: uid(),
    date,
    playerId,
    goals,
    win,
    streakCounter,
    createdAt: new Date().toISOString(),
  });

  // reset goals input quickly
  els.logGoals.value = "0";
  renderAll();
}

function deleteLog(logId) {
  const log = state.logs.find(l => l.id === logId);
  if (!log) return;
  if (!confirm("Delete this entry?")) return;
  state.logs = state.logs.filter(l => l.id !== logId);
  renderAll();
}

function renderPlayerSelect() {
  const options = state.players
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  els.logPlayer.innerHTML = options;

  // keep selected if possible
  if (!els.logPlayer.value && state.players.length) {
    els.logPlayer.value = state.players[0].id;
  }
}

function renderPlayers(statsById) {
  const html = state.players
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(p => {
      const s = statsById[p.id] || blankStats();
      return `
        <div class="item">
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="meta">Goals: <b>${s.goals}</b> · Matches: <b>${s.matches}</b> · Wins: <b>${s.wins}</b> · Win%: <b>${fmtPct(s.winPct)}</b></div>
            <div class="meta">Streak: <b>${s.currentStreak}</b> (Best ${s.bestStreak})</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="pill">⚽ ${s.goals}</span>
            <button class="ghost" onclick="window.__rmPlayer('${p.id}')">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");
  els.playersList.innerHTML = html || `<div class="meta">No players yet.</div>`;
  window.__rmPlayer = removePlayer;
}

function renderLogsList() {
  const html = state.logs
    .slice(0, 30)
    .map(l => {
      const p = state.players.find(x => x.id === l.playerId);
      const name = p ? p.name : "(Unknown)";
      return `
        <div class="item">
          <div>
            <div class="name">${escapeHtml(name)} — ${l.win ? "✅ Win" : "❌ Loss"}</div>
            <div class="meta">${escapeHtml(l.date)} · Goals: <b>${l.goals}</b> · Streak: <b>${l.streakCounter}</b></div>
          </div>
          <button class="ghost" onclick="window.__delLog('${l.id}')">Delete</button>
        </div>
      `;
    })
    .join("");
  els.logsList.innerHTML = html || `<div class="meta">No entries yet.</div>`;
  window.__delLog = deleteLog;
}

function renderLeaderboard(statsById) {
  const minM = clampInt(els.minMatches.value, 0, 999);
  const sort = els.sortBy.value;

  const rows = state.players
    .map(p => ({ p, s: statsById[p.id] || blankStats() }))
    .filter(x => x.s.matches >= minM);

  rows.sort((a,b) => compareStats(a.s, b.s, sort) || a.p.name.localeCompare(b.p.name));

  els.leaderBody.innerHTML = rows.map((x, idx) => `
    <tr>
      <td>${idx+1}</td>
      <td>${escapeHtml(x.p.name)}</td>
      <td>${x.s.goals}</td>
      <td>${x.s.matches}</td>
      <td>${x.s.wins}</td>
      <td>${fmtPct(x.s.winPct)}</td>
      <td>${x.s.currentStreak}</td>
      <td>${x.s.bestStreak}</td>
    </tr>
  `).join("") || `<tr><td colspan="8" style="color:#a9b6d6;padding:14px">No data yet.</td></tr>`;
}

function renderDashboard(statsById) {
  els.kpiPlayers.textContent = String(state.players.length);
  els.kpiLogs.textContent = String(state.logs.length);

  const rows = state.players.map(p => ({ p, s: statsById[p.id] || blankStats() }));

  // top scorers
  const topGoals = rows.slice().sort((a,b)=> b.s.goals - a.s.goals || b.s.matches - a.s.matches).slice(0,5);
  els.topScorers.innerHTML = topGoals.map(x => `
    <div class="item">
      <div>
        <div class="name">${escapeHtml(x.p.name)}</div>
        <div class="meta">Goals: <b>${x.s.goals}</b> · Matches: <b>${x.s.matches}</b> · Win%: <b>${fmtPct(x.s.winPct)}</b></div>
      </div>
      <span class="pill">⚽ ${x.s.goals}</span>
    </div>
  `).join("") || `<div class="meta">Add players and match entries to see stats.</div>`;

  // top streaks
  const topSt = rows.slice().sort((a,b)=> b.s.currentStreak - a.s.currentStreak || b.s.bestStreak - a.s.bestStreak).slice(0,5);
  els.topStreaks.innerHTML = topSt.map(x => `
    <div class="item">
      <div>
        <div class="name">${escapeHtml(x.p.name)}</div>
        <div class="meta">Current: <b>${x.s.currentStreak}</b> · Best: <b>${x.s.bestStreak}</b></div>
      </div>
      <span class="pill">🔥 ${x.s.currentStreak}</span>
    </div>
  `).join("") || `<div class="meta">No streak data yet.</div>`;
}

function computeAllPlayerStats() {
  // group logs per player
  const byPlayer = Object.create(null);
  for (const p of state.players) byPlayer[p.id] = [];

  for (const l of state.logs) {
    if (!byPlayer[l.playerId]) continue;
    byPlayer[l.playerId].push(l);
  }

  // compute stats per playerId
  const out = Object.create(null);

  for (const p of state.players) {
    const logs = (byPlayer[p.id] || []).slice().sort((a,b)=> (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // desc
    let goals = 0, wins = 0, matches = logs.length;

    for (const l of logs) {
      goals += (l.goals || 0);
      wins += l.win ? 1 : 0;
    }

    const winPct = matches ? (wins / matches) : 0;

    // current streak: consecutive wins from most recent going backwards
    let currentStreak = 0;
    for (const l of logs) {
      if (l.win) currentStreak++;
      else break;
    }

    // best streak: max consecutive wins in chronological order
    const logsAsc = logs.slice().sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let bestStreak = 0, run = 0;
    for (const l of logsAsc) {
      if (l.win) { run++; bestStreak = Math.max(bestStreak, run); }
      else run = 0;
    }

    out[p.id] = { goals, wins, matches, winPct, currentStreak, bestStreak };
  }

  return out;
}

function compareStats(a, b, sortKey) {
  switch(sortKey){
    case "goals": return (b.goals - a.goals);
    case "wins": return (b.wins - a.wins);
    case "matches": return (b.matches - a.matches);
    case "winpct": return (b.winPct - a.winPct);
    case "currentStreak": return (b.currentStreak - a.currentStreak);
    case "bestStreak": return (b.bestStreak - a.bestStreak);
    case "points": default:
      // points == goals in this version (no assists). kept for future expand.
      return (b.goals - a.goals);
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sunday-league-pro-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ""));
      if (!data || !Array.isArray(data.players) || !Array.isArray(data.logs)) {
        return alert("Invalid backup file.");
      }
      state.players = data.players;
      state.logs = data.logs;
      saveState();
      renderAll();
      alert("Imported successfully!");
    } catch {
      alert("Failed to import.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function resetAll() {
  if (!confirm("Reset ALL data?")) return;
  state.players = [];
  state.logs = [];
  saveState();
  renderAll();
}

function ensureUniquePlayerNames(){
  // Avoid duplicate IDs collisions etc.
  // No-op for now (names are validated on add)
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { players: [], logs: [] };
    const parsed = JSON.parse(raw);
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return { players: [], logs: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clampInt(v, min, max) {
  const n = Number.parseInt(String(v), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function fmtPct(x) {
  if (!Number.isFinite(x)) return "0%";
  return `${Math.round(x * 100)}%`;
}

function blankStats() {
  return { goals:0, wins:0, matches:0, winPct:0, currentStreak:0, bestStreak:0 };
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
