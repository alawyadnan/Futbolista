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

import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  authDomain: "el-futbolistas.firebaseapp.com",
  projectId: "el-futbolistas",
  storageBucket: "el-futbolistas.appspot.com"
};

const ADMIN_EMAIL = "admin@ftbll.live"; // <-- غيّره

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.warn);

const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");

let players = [];
let logs = [];
let isAdmin = false;
let currentProfileId = null;

const $ = (id) => document.getElementById(id);

window.__adminLogin = async () => {
  try {
    if (auth.currentUser) {
      await signOut(auth);
      return;
    }

    const email = prompt("Admin Email:");
    if (!email) return;

    const password = prompt("Admin Password:");
    if (!password) return;

    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    alert("Login failed:\n" + (e?.message || e));
    console.error(e);
  }
};

window.__exportNow = () => {
  if (isAdmin) exportJSON();
};

document.addEventListener("DOMContentLoaded", () => {
  if ($("logDate")) $("logDate").value = new Date().toISOString().slice(0, 10);

  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.dataset.nav;
      if (btn.dataset.admin === "1" && !isAdmin) return;
      showScreen(target);
      setActiveNav(target);
    });
  });

  $("playerCards")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-player-id]");
    if (!card) return;
    openProfile(card.getAttribute("data-player-id"));
  });

  $("btnProfileBack")?.addEventListener("click", () => {
    currentProfileId = null;
    showScreen("playerstats");
    setActiveNav("playerstats");
  });

  $("cmpPlayerA")?.addEventListener("change", renderCompare);
  $("cmpPlayerB")?.addEventListener("change", renderCompare);

  $("btnAddPlayer")?.addEventListener("click", async () => {
    if (!isAdmin) return alert("Read only");
    const name = ($("playerName")?.value || "").trim();
    if (!name) return alert("Enter a name");
    await addDoc(playersRef, { name, createdAt: Date.now() });
    $("playerName").value = "";
  });

  $("btnAddLog")?.addEventListener("click", async () => {
    if (!isAdmin) return alert("Read only");

    const playerId = $("logPlayer")?.value;
    if (!playerId) return alert("Pick a player");

    const goals = clampInt($("logGoals")?.value, 0, 99);
    const result = $("logResult")?.value || "win";
    const side = $("logSide")?.value || "A";
    const goalType = $("logGoalType")?.value || "normal";
    const ownGoal = goalType === "own";
    const date = $("logDate")?.value || new Date().toISOString().slice(0, 10);

    await addDoc(logsRef, {
      playerId,
      goals,
      result,
      side,
      ownGoal,
      date,
      createdAt: Date.now()
    });
  });

  $("lbSort")?.addEventListener("change", renderAll);
  $("tableSort")?.addEventListener("change", renderAll);

  $("btnExport")?.addEventListener("click", () => {
    if (isAdmin) exportJSON();
  });

  $("btnReset")?.addEventListener("click", async () => {
    if (!isAdmin) return alert("Read only");
    const ok = confirm("Delete ALL data? This cannot be undone.");
    if (!ok) return;
    await resetAllData();
  });

  onAuthStateChanged(auth, (user) => {
    const email = (user?.email || "").trim().toLowerCase();
    isAdmin = !!user && email === ADMIN_EMAIL.trim().toLowerCase();

    document.body.classList.toggle("is-admin", isAdmin);

    const btn = $("btnAdminLogin");
    if (btn) btn.textContent = isAdmin ? "Logout" : "Admin Login";

    const openAdminScreen = document.querySelector(".screen:not(.hidden)[data-admin='1']");
    if (openAdminScreen && !isAdmin) {
      showScreen("dashboard");
      setActiveNav("dashboard");
    }
  });

  onSnapshot(query(playersRef, orderBy("createdAt", "asc")), snap => {
    players = [];
    snap.forEach(d => players.push({ id: d.id, ...d.data() }));
    renderAll();
  });

  onSnapshot(query(logsRef, orderBy("createdAt", "desc")), snap => {
    logs = [];
    snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
    renderAll();
  });

  showScreen("dashboard");
  setActiveNav("dashboard");
});

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(`screen-${name}`)?.classList.remove("hidden");
}

function setActiveNav(name) {
  document.querySelectorAll(".navbtn").forEach(b => b.classList.remove("active"));
  const el = document.querySelector(`.navbtn[data-nav="${name}"]`);
  el?.classList.add("active");

  const scroller = document.querySelector(".bottomnav-inner");
  if (scroller && el && scroller.scrollWidth > scroller.clientWidth) {
    const left = el.offsetLeft - (scroller.clientWidth / 2) + (el.clientWidth / 2);
    scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
}

function normalizeResult(l) {
  if (l?.result === "win" || l?.result === "draw" || l?.result === "loss") return l.result;
  if (typeof l?.win === "boolean") return l.win ? "win" : "loss";
  return "loss";
}

function normalizeSide(l) {
  if (l?.side === "A" || l?.side === "B") return l.side;
  const r = normalizeResult(l);
  if (r === "win") return "A";
  if (r === "loss") return "B";
  return "A";
}

function isOwnGoal(l) {
  return !!l?.ownGoal;
}

function blankStats() {
  return { matches:0, wins:0, goals:0, winPct:0, gpm:0, current:0, best:0 };
}

function computeAllStats(sourceLogs = logs) {
  const byId = {};
  players.forEach(p => byId[p.id] = blankStats());

  const grouped = {};
  players.forEach(p => grouped[p.id] = []);
  sourceLogs.forEach(l => { if (grouped[l.playerId]) grouped[l.playerId].push(l); });

  players.forEach(p => {
    const arr = (grouped[p.id] || []).slice().sort((a,b) => {
      const da = String(a.date || ""), db = String(b.date || "");
      if (da < db) return -1;
      if (da > db) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const matches = arr.length;
    let wins = 0;
    let goals = 0;

    arr.forEach(l => {
      const result = normalizeResult(l);
      if (result === "win") wins += 1;
      if (!isOwnGoal(l)) goals += Number(l.goals || 0);
    });

    const winPct = matches ? wins / matches : 0;
    const gpm = matches ? goals / matches : 0;

    let best = 0;
    let run = 0;
    arr.forEach(l => {
      const result = normalizeResult(l);
      if (result === "win") {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    });

    byId[p.id] = { matches, wins, goals, winPct, gpm, current: getCurrentStreak(arr), best };
  });

  return byId;
}

function getCurrentStreak(arr){
  let current = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const result = normalizeResult(arr[i]);
    if (result === "win") current++;
    else break;
  }
  return current;
}

function getPlayerFormData(playerId, statsMap, sourceLogs = logs){
  const playerLogs = sourceLogs
    .filter(l => String(l.playerId) === String(playerId))
    .sort((a,b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da < db) return 1;
      if (da > db) return -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  const last5 = playerLogs.slice(0, 5);

  let formPoints = 0;
  last5.forEach(l => {
    const r = normalizeResult(l);
    if (r === "win") formPoints += 1;
    else if (r === "draw") formPoints += 0.5;
  });

  const formIcons = last5
    .slice()
    .reverse()
    .map(l => {
      const r = normalizeResult(l);
      if (r === "win") return "🟢";
      if (r === "draw") return "🟡";
      return "🔴";
    })
    .join(" ");

  return {
    formPoints,
    formIcons,
    totalPlayerMatches: statsMap[playerId]?.matches || 0
  };
}

function getTotalUniqueMatchDates(sourceLogs = logs){
  const set = new Set(
    sourceLogs
      .map(l => String(l.date || "").trim())
      .filter(Boolean)
  );
  return set.size;
}

function getEligibleMinMatches(sourceLogs = logs){
  const totalMatches = getTotalUniqueMatchDates(sourceLogs);
  return Math.max(1, Math.floor(totalMatches / 2));
}

function getEligiblePlayerIds(statsMap, sourceLogs = logs){
  const minEligible = getEligibleMinMatches(sourceLogs);
  return new Set(
    players
      .filter(p => (statsMap[p.id]?.matches || 0) >= minEligible)
      .map(p => p.id)
  );
}

function formatFormPoints(n){
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function renderAll() {
  const sel = $("logPlayer");
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = players
      .slice()
      .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
      .map(p => `<option value="${p.id}">${esc(p.name||"")}</option>`)
      .join("");
    if (cur && players.some(p => p.id === cur)) sel.value = cur;
  }

  renderCompareOptions();

  const stats = computeAllStats();
  renderPlayerOfMonth();
  renderDashboard(stats);
  renderInForm(stats);
  renderLeaderboard(stats);
  renderTable(stats);
  renderPlayersAdmin(stats);
  renderLogs();
  renderMatchHistory();
  renderPlayerCardsNameOnly();
  renderCompare();
  if (currentProfileId) renderPlayerProfile(stats, currentProfileId);
}

/* =========================
   Player of the Month
========================= */

function renderPlayerOfMonth() {
  const monthEl = $("potmCurrentMonth");
  const listEl = $("potmCurrentList");
  const pastEl = $("potmPastMonths");
  const detailsEl = $("potmPastDetails");

  if (!monthEl || !listEl || !pastEl || !detailsEl) return;

  const monthly = computeMonthlyAwards(logs);
  const monthKeys = Object.keys(monthly).sort((a,b) => b.localeCompare(a));

  if (!monthKeys.length) {
    monthEl.textContent = "—";
    listEl.innerHTML = `<div class="note">No monthly data yet.</div>`;
    pastEl.innerHTML = `<div class="note">No past months yet.</div>`;
    detailsEl.open = false;
    return;
  }

  const currentMonthKey = monthKeys[0];
  const currentMonth = monthly[currentMonthKey];
  monthEl.textContent = formatMonthLabel(currentMonthKey);
  listEl.innerHTML = renderPotmCards(currentMonth.top3);

  const pastKeys = monthKeys.slice(1);

  if (!pastKeys.length) {
    detailsEl.open = false;
    pastEl.innerHTML = `<div class="note">No past months yet.</div>`;
    return;
  }

  pastEl.innerHTML = pastKeys.map(key => {
    const data = monthly[key];
    return `
      <div class="potmPastMonthBlock">
        <div class="potmPastMonthTitle">${esc(formatMonthLabel(key))}</div>
        ${renderPotmCards(data.top3)}
      </div>
    `;
  }).join("");
}

function computeMonthlyAwards(sourceLogs = logs) {
  const byDate = {};
  sourceLogs.forEach(l => {
    const d = String(l.date || "").trim();
    if (!d) return;
    (byDate[d] ||= []).push(l);
  });

  const monthlyStats = {};

  Object.keys(byDate).forEach(date => {
    const entries = byDate[date];
    const monthKey = date.slice(0, 7);

    const teamA = entries.filter(x => normalizeSide(x) === "A");
    const teamB = entries.filter(x => normalizeSide(x) === "B");

    const scoreA = calcTeamScore(teamA, teamB);
    const scoreB = calcTeamScore(teamB, teamA);

    entries.forEach(entry => {
      const pid = entry.playerId;
      if (!pid) return;

      const side = normalizeSide(entry);
      const result = normalizeResult(entry);
      const teamScored = side === "A" ? scoreA : scoreB;
      const teamConceded = side === "A" ? scoreB : scoreA;
      const personalGoals = isOwnGoal(entry) ? 0 : Number(entry.goals || 0);

      (monthlyStats[monthKey] ||= {});
      (monthlyStats[monthKey][pid] ||= {
        playerId: pid,
        name: players.find(p => p.id === pid)?.name || "Unknown",
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        rawScore: 0
      });

      const s = monthlyStats[monthKey][pid];

      s.matches += 1;
      if (result === "win") s.wins += 1;
      else if (result === "draw") s.draws += 1;
      else s.losses += 1;

      s.goals += personalGoals;

      let points = 0;
      points += 0.5; // attendance
      points += personalGoals * 0.1;

      if (result === "win") points += 1;
      else if (result === "draw") points += 0.5;
      else points -= 0.5;

      if (teamScored >= 10) points += 0.5;
      else if (teamScored >= 5) points += 0.2;

      if (teamConceded <= 3) points += 0.8;
      else if (teamConceded < 5) points += 0.5;

      s.rawScore += points;
    });
  });

  const output = {};

  Object.keys(monthlyStats).forEach(monthKey => {
    const rows = Object.values(monthlyStats[monthKey]).sort((a,b) =>
      (b.rawScore - a.rawScore) ||
      (b.matches - a.matches) ||
      (b.wins - a.wins) ||
      (b.draws - a.draws) ||
      (a.losses - b.losses) ||
      (b.goals - a.goals) ||
      a.name.localeCompare(b.name)
    );

    const rated = rows.map(r => ({
      ...r,
      rating10: Math.min(10, r.rawScore)
    }));

    output[monthKey] = {
      all: rated,
      top3: rated.slice(0, 3)
    };
  });

  return output;
}

function renderPotmCards(rows) {
  if (!rows?.length) return `<div class="note">No data for this month.</div>`;

  return `
    <div class="potmGrid">
      ${rows.map((r, idx) => `
        <div class="potmCard ${idx === 0 ? "potmFirst" : ""}">
          <div class="potmTop">
            <div class="potmPlace">${potmMedal(idx)}</div>
            <div class="potmScore">${fmt1(r.rating10)}/10</div>
          </div>
          <div class="potmName">${esc(r.name)}</div>
          <div class="potmMeta">
            ${r.matches} Matches | ${r.wins} Wins | ${r.draws} Draws | ${r.losses} Losses | ${r.goals} Goal${r.goals === 1 ? "" : "s"}
          </div>
          <div class="potmRaw">Monthly score: ${fmt1(r.rawScore)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

/* =========================
   Dashboard / Leaderboard / Table
========================= */

function renderInForm(stats){
  const box = $("inFormList");
  if (!box) return;

  const minEligibleMatches = getEligibleMinMatches(logs);

  const rows = players.map(p => {
    const form = getPlayerFormData(p.id, stats);
    return {
      id: p.id,
      name: p.name || "",
      totalPlayerMatches: form.totalPlayerMatches,
      formPoints: form.formPoints,
      formIcons: form.formIcons,
      goals: stats[p.id]?.goals || 0,
      winPct: stats[p.id]?.winPct || 0
    };
  });

  const eligible = rows
    .filter(r => r.totalPlayerMatches >= minEligibleMatches)
    .sort((a,b) =>
      (b.formPoints - a.formPoints) ||
      (b.winPct - a.winPct) ||
      (b.goals - a.goals) ||
      a.name.localeCompare(b.name)
    )
    .slice(0, 3);

  if (!eligible.length){
    box.innerHTML = `<div class="note">No eligible players yet. Minimum matches required: ${minEligibleMatches}.</div>`;
    return;
  }

  box.innerHTML = eligible.map((r, i) => `
    <div class="item">
      <div>
        <div class="name">${medal(i)} ${esc(r.name)}</div>
        <div class="meta">
          Points: <b>${formatFormPoints(r.formPoints)}</b> ·
          Last 5: <b>${r.formIcons || "—"}</b> ·
          Matches: <b>${r.totalPlayerMatches}</b>
        </div>
      </div>
    </div>
  `).join("");
}

function renderDashboard(stats) {
  const eligibleIds = getEligiblePlayerIds(stats, logs);
  const rows = players
    .filter(p => eligibleIds.has(p.id))
    .map(p=>({p,s:stats[p.id]||blankStats()}));

  const topGoals = rows.slice().sort((a,b)=>(b.s.goals-a.s.goals)||(b.s.gpm-a.s.gpm)).slice(0,3);
  $("dashTopScorers") && ($("dashTopScorers").innerHTML =
    topGoals.length
      ? topGoals.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `${x.s.goals} goals · G/Match ${fmt2(x.s.gpm)} · Win% ${fmtPct(x.s.winPct)}`)).join("")
      : `<div class="note">No eligible players yet.</div>`);

  const topStreak = rows.slice().sort((a,b)=>(b.s.current-a.s.current)||(b.s.best-a.s.best)).slice(0,3);
  $("dashTopStreaks") && ($("dashTopStreaks").innerHTML =
    topStreak.length
      ? topStreak.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `Current: ${x.s.current} · Best: ${x.s.best} · Matches: ${x.s.matches}`)).join("")
      : `<div class="note">No eligible players yet.</div>`);

  const topWin = rows.slice().sort((a,b)=>(b.s.winPct-a.s.winPct)||(b.s.wins-a.s.wins)).slice(0,3);
  $("dashTopWinPct") && ($("dashTopWinPct").innerHTML =
    topWin.length
      ? topWin.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches} · Goals ${x.s.goals}`)).join("")
      : `<div class="note">No eligible players yet.</div>`);
}

function renderLeaderboard(stats) {
  const sortBy = $("lbSort")?.value || "form";
  const eligibleIds = getEligiblePlayerIds(stats, logs);

  const rows = players
    .filter(p => eligibleIds.has(p.id))
    .map(p => {
      const s = stats[p.id] || blankStats();
      const form = getPlayerFormData(p.id, stats);

      return {
        id: p.id,
        name: p.name || "",
        matches: s.matches,
        wins: s.wins,
        goals: s.goals,
        winPct: s.winPct,
        gpm: s.gpm,
        curStreak: s.current,
        bestStreak: s.best,
        formPoints: form.formPoints,
        formIcons: form.formIcons
      };
    }).sort(sorter(sortBy));

  const box = $("leaderboardList");
  if (!box) return;

  box.innerHTML = rows.length
    ? rows.map((r,i)=>`
      <div class="item">
        <div>
          <div class="name">${medal(i)} ${esc(r.name)}</div>
          <div class="meta">
            Form <b>${formatFormPoints(r.formPoints)}</b> ·
            Last 5 <b>${r.formIcons || "—"}</b> ·
            Matches <b>${r.matches}</b> · Wins <b>${r.wins}</b> · Goals <b>${r.goals}</b> ·
            Win% <b>${fmtPct(r.winPct)}</b> · G/Match <b>${fmt2(r.gpm)}</b> ·
            Streak <b>${r.curStreak}</b> (best ${r.bestStreak})
          </div>
        </div>
      </div>
    `).join("")
    : `<div class="note">No eligible players yet.</div>`;
}

function renderTable(stats) {
  const sortBy = $("tableSort")?.value || "winPct";
  const eligibleIds = getEligiblePlayerIds(stats, logs);

  const rows = players
    .filter(p => eligibleIds.has(p.id))
    .map(p => {
      const s = stats[p.id] || blankStats();
      return {
        name: p.name || "",
        matches: s.matches,
        wins: s.wins,
        goals: s.goals,
        winPct: s.winPct,
        gpm: s.gpm,
        curStreak: s.current,
        bestStreak: s.best
      };
    })
    .sort(sorter(sortBy));

  const body = $("tableBody");
  if (!body) return;

  body.innerHTML = rows.length
    ? rows.map((r,idx)=>`
      <tr>
        <td>${idx+1}</td>
        <td>${esc(r.name)}</td>
        <td>${r.matches}</td>
        <td>${r.wins}</td>
        <td>${r.goals}</td>
        <td>${fmtPct(r.winPct)}</td>
        <td>${fmt2(r.gpm)}</td>
        <td>${r.curStreak}</td>
        <td>${r.bestStreak}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="9" class="noteCell">No eligible players yet.</td></tr>`;
}

/* =========================
   Remaining screens
========================= */

function renderPlayersAdmin(stats) {
  const box = $("playersList");
  if (!box) return;

  const html = players
    .slice()
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
    .map(p => {
      const s = stats[p.id] || blankStats();
      return `
        <div class="item">
          <div>
            <div class="name">${esc(p.name||"")}</div>
            <div class="meta">
              Matches <b>${s.matches}</b> · Wins <b>${s.wins}</b> · Goals <b>${s.goals}</b> ·
              Win% <b>${fmtPct(s.winPct)}</b> · G/Match <b>${fmt2(s.gpm)}</b> ·
              Streak <b>${s.current}</b> (best ${s.best})
            </div>
          </div>
        </div>
      `;
    }).join("");

  box.innerHTML = html || `<div class="note">No players yet.</div>`;
}

function renderLogs() {
  const box = $("logsList");
  if (!box) return;

  box.innerHTML = logs.slice(0,30).map(l => {
    const p = players.find(x=>x.id===l.playerId);
    const name = p ? p.name : "(Unknown)";
    const result = normalizeResult(l);
    const side = normalizeSide(l);
    const own = isOwnGoal(l);

    return `
      <div class="item">
        <div>
          <div class="name">${esc(name)} — ${result.toUpperCase()}${own ? " · OWN GOAL" : ""}</div>
          <div class="meta">${esc(l.date||"")} · Team ${side} · Goals: <b>${Number(l.goals||0)}</b></div>
        </div>
      </div>
    `;
  }).join("") || `<div class="note">No entries yet.</div>`;
}

function compareCenterValueRow(label, value){
  return `
    <div class="compareRow compareRowCenterOnly">
      <div class="compareSingleWrap">
        <span class="compareSingleLabel">${esc(label)}</span>
        <span class="compareSingleVal">${esc(value)}</span>
      </div>
    </div>
  `;
}

function compareCompactDualRow(label, leftVal, rightVal){
  return `
    <div class="compareRow compareRowCompactDual">
      <div class="compareCompactSide">${esc(leftVal)}</div>
      <div class="compareCompactLabel">${esc(label)}</div>
      <div class="compareCompactSide">${esc(rightVal)}</div>
    </div>
  `;
}

function exportJSON() {
  const data = { exportedAt:new Date().toISOString(), players, logs };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ftbll_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function resetAllData() {
  const logsSnap = await getDocs(logsRef);
  for (const d of logsSnap.docs) await deleteDoc(doc(db,"logs",d.id));

  const playersSnap = await getDocs(playersRef);
  for (const d of playersSnap.docs) await deleteDoc(doc(db,"players",d.id));
}

function clampInt(v,min,max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function fmtPct(x){ return `${Math.round((Number(x)||0)*100)}%`; }
function fmt2(x){ return (Number(x)||0).toFixed(2); }
function fmt1(x){ return (Number(x)||0).toFixed(1); }

function medal(i){ return i===0?"🥇":i===1?"🥈":i===2?"🥉":""; }
function dashItem(t,m){ return `<div class="item"><div><div class="name">${t}</div><div class="meta">${m}</div></div></div>`; }

function esc(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function sorter(k) {
  if (k === "name") return (a,b)=>a.name.localeCompare(b.name);
  if (k === "form") {
    return (a,b)=>
      (Number(b.formPoints||0)-Number(a.formPoints||0)) ||
      (Number(b.winPct||0)-Number(a.winPct||0)) ||
      (Number(b.goals||0)-Number(a.goals||0)) ||
      a.name.localeCompare(b.name);
  }

  const key = ({
    winPct:"winPct",
    goals:"goals",
    gpm:"gpm",
    wins:"wins",
    matches:"matches",
    curStreak:"curStreak",
    bestStreak:"bestStreak"
  }[k]) || "winPct";

  return (a,b)=>
    (Number(b[key]||0)-Number(a[key]||0)) ||
    (Number(b.goals||0)-Number(a.goals||0)) ||
    a.name.localeCompare(b.name);
}
