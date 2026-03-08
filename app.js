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

function computeAllStats() {
  const byId = {};
  players.forEach(p => byId[p.id] = blankStats());

  const grouped = {};
  players.forEach(p => grouped[p.id] = []);
  logs.forEach(l => { if (grouped[l.playerId]) grouped[l.playerId].push(l); });

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

    let current = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const result = normalizeResult(arr[i]);
      if (result === "win") current++;
      else break;
    }

    byId[p.id] = { matches, wins, goals, winPct, gpm, current, best };
  });

  return byId;
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

  const stats = computeAllStats();
  renderDashboard(stats);
  renderInForm(stats);
  renderLeaderboard(stats);
  renderTable(stats);
  renderPlayersAdmin(stats);
  renderLogs();
  renderMatchHistory();
  renderPlayerCardsNameOnly();
  if (currentProfileId) renderPlayerProfile(stats, currentProfileId);
}

function renderInForm(stats){
  const box = $("inFormList");
  if (!box) return;

  const totalMatchesInSystem = getTotalUniqueMatchDates();
  const minEligibleMatches = Math.max(1, Math.floor(totalMatchesInSystem / 2));

  const rows = players.map(p => {
    const playerLogs = logs
      .filter(l => String(l.playerId) === String(p.id))
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
      id: p.id,
      name: p.name || "",
      totalPlayerMatches: stats[p.id]?.matches || 0,
      formPoints,
      formIcons,
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
          Form points: <b>${formatFormPoints(r.formPoints)}</b> ·
          Last 5: <b>${r.formIcons || "—"}</b> ·
          Matches: <b>${r.totalPlayerMatches}</b>
        </div>
      </div>
    </div>
  `).join("");
}

function getTotalUniqueMatchDates(){
  const set = new Set(
    logs
      .map(l => String(l.date || "").trim())
      .filter(Boolean)
  );
  return set.size;
}

function formatFormPoints(n){
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function renderPlayerCardsNameOnly() {
  const box = $("playerCards");
  if (!box) return;

  if (!players.length) {
    box.classList.add("note");
    box.textContent = "No players yet.";
    return;
  }

  box.classList.remove("note");

  const sorted = players.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  box.innerHTML = sorted.map(p => `
    <div class="pCard pCardNameOnly" data-player-id="${p.id}">
      <div class="pName">${esc(p.name||"")}</div>
    </div>
  `).join("");
}

function openProfile(pid) {
  currentProfileId = pid;
  showScreen("playerprofile");
  setActiveNav("playerstats");
  const stats = computeAllStats();
  renderPlayerProfile(stats, pid);
}

function renderPlayerProfile(stats, pid) {
  const p = players.find(x=>x.id===pid);
  if (!p) return;

  const s = stats[pid] || blankStats();

  $("profileName") && ($("profileName").textContent = p.name || "Player");
  $("profileSub") && ($("profileSub").textContent = "");

  const grid = $("profileStatsGrid");
  if (grid) {
    grid.innerHTML = [
      tile("Matches", s.matches),
      tile("Goals", s.goals),
      tile("Wins", s.wins),
      tile("Win %", fmtPct(s.winPct)),
      tile("Goals per Match", fmt2(s.gpm)),
      tile("Current Win Streak", s.current),
      tile("Best Win Streak", s.best),
    ].join("");
  }

  const playerLogs = logs
    .filter(l => String(l.playerId) === String(pid))
    .sort((a,b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da < db) return 1;
      if (da > db) return -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  const last5 = playerLogs.slice(0, 5).reverse();

  const icons = last5.map(l => {
    const r = normalizeResult(l);
    if (r === "win") return "🟢";
    if (r === "draw") return "🟡";
    return "🔴";
  });

  const formBox = $("profileForm");
  if (formBox) {
    formBox.textContent = icons.length ? icons.join(" ") : "No matches yet";
  }

  const counts = computeTeammates(pid);
  const matesBox = $("profileMates");
  const neverBox = $("profileNever");

  const sorted = Object.entries(counts)
    .sort((a,b)=> b[1]-a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));

  const playedIds = new Set(sorted.map(([id])=>id));
  const never = players
    .filter(x => x.id !== pid && !playedIds.has(x.id))
    .map(x => x.name || "Unknown")
    .sort((a,b)=>a.localeCompare(b));

  if (matesBox) {
    if (!sorted.length) {
      matesBox.classList.add("note");
      matesBox.textContent = "No teammate data yet.";
    } else {
      matesBox.classList.remove("note");
      matesBox.innerHTML = sorted.map(([id,c])=>`
        <div class="mateRow">
          <div class="playerName">${esc(nameOf(id))}</div>
          <div class="playerGoals">${c}</div>
        </div>
      `).join("");
    }
  }

  if (neverBox) {
    if (!never.length) {
      neverBox.classList.add("note");
      neverBox.textContent = "—";
    } else {
      neverBox.classList.remove("note");
      neverBox.textContent = never.join(" - ");
    }
  }

  function nameOf(id) {
    return (players.find(x=>x.id===id)?.name) || "Unknown";
  }
}

function tile(label, value) {
  return `<div class="statTile"><div class="stLabel">${esc(label)}</div><div class="stValue">${esc(value)}</div></div>`;
}

function computeTeammates(pid) {
  const byDate = {};
  logs.forEach(l => {
    const d = String(l.date || "");
    if (!d) return;
    (byDate[d] ||= []).push(l);
  });

  const counts = {};
  Object.keys(byDate).forEach(date => {
    const arr = byDate[date];
    const playerEntry = arr.find(x => x.playerId === pid);
    if (!playerEntry) return;

    const side = normalizeSide(playerEntry);
    arr.filter(x => normalizeSide(x) === side).forEach(x => {
      if (x.playerId === pid) return;
      counts[x.playerId] = (counts[x.playerId] || 0) + 1;
    });
  });

  return counts;
}

function renderMatchHistory() {
  const box = $("matchHistoryList");
  if (!box) return;

  const idToName = {};
  players.forEach(p => idToName[p.id] = p.name || "Unknown");

  const byDate = {};
  logs.forEach(l => {
    const d = String(l.date || "");
    if (!d) return;
    (byDate[d] ||= []).push(l);
  });

  const dates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  if (!dates.length) {
    box.innerHTML = `<div class="note">No matches yet.</div>`;
    return;
  }

  box.innerHTML = dates.map(date => {
    const arr = byDate[date];
    const teamA = arr.filter(x => normalizeSide(x) === "A");
    const teamB = arr.filter(x => normalizeSide(x) === "B");

    const scoreA = calcTeamScore(teamA, teamB);
    const scoreB = calcTeamScore(teamB, teamA);

    const titleA = scoreA > scoreB ? "Winners" : scoreA < scoreB ? "Losers" : "Draw";
    const titleB = scoreB > scoreA ? "Winners" : scoreB < scoreA ? "Losers" : "Draw";

    const linesA = sideLines(teamA, idToName);
    const linesB = sideLines(teamB, idToName);

    return `
      <div class="item">
        <div class="matchCard">
          <div class="matchTop">
            <div class="matchDate">${esc(date)}</div>
            <div class="matchScore">${scoreA} : ${scoreB}</div>
          </div>

          <div class="matchGrid">
            <div class="teamBox">
              <div class="teamTitle">${titleA}</div>
              ${linesA.length ? linesA.join("") : `<div class="meta">—</div>`}
            </div>

            <div class="teamBox">
              <div class="teamTitle">${titleB}</div>
              ${linesB.length ? linesB.join("") : `<div class="meta">—</div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function calcTeamScore(teamEntries, oppositeEntries) {
  const normalGoals = teamEntries.reduce((sum, x) => sum + (isOwnGoal(x) ? 0 : Number(x.goals || 0)), 0);
  const oppOwnGoals = oppositeEntries.reduce((sum, x) => sum + (isOwnGoal(x) ? Number(x.goals || 0) : 0), 0);
  return normalGoals + oppOwnGoals;
}

function sideLines(entries, idToName) {
  const arr = entries.map(e => ({
    name: idToName[e.playerId] || "Unknown",
    goals: Number(e.goals || 0),
    ownGoal: isOwnGoal(e)
  }));

  const scorers = arr
    .filter(x => !x.ownGoal && x.goals > 0)
    .sort((a,b)=> b.goals - a.goals || a.name.localeCompare(b.name));

  const owns = arr
    .filter(x => x.ownGoal && x.goals > 0)
    .sort((a,b)=> b.goals - a.goals || a.name.localeCompare(b.name));

  const others = arr
    .filter(x => !x.ownGoal && x.goals <= 0)
    .sort((a,b)=> a.name.localeCompare(b.name));

  const lines = [];

  scorers.forEach(x => {
    lines.push(`<div class="teamLine"><div class="playerName">${esc(x.name)}</div><div class="playerGoals">(${x.goals})</div></div>`);
  });

  owns.forEach(x => {
    const label = x.goals === 1 ? "own goal" : `own goals x${x.goals}`;
    lines.push(`<div class="teamLine"><div class="playerName">${esc(x.name)} (${label})</div><div class="playerGoals"></div></div>`);
  });

  others.forEach(x => {
    lines.push(`<div class="teamLine"><div class="playerName">${esc(x.name)}</div><div class="playerGoals"></div></div>`);
  });

  return lines;
}

function renderDashboard(stats) {
  const rows = players.map(p=>({p,s:stats[p.id]||blankStats()}));

  const topGoals = rows.slice().sort((a,b)=>(b.s.goals-a.s.goals)||(b.s.gpm-a.s.gpm)).slice(0,3);
  $("dashTopScorers") && ($("dashTopScorers").innerHTML =
    topGoals.length
      ? topGoals.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `${x.s.goals} goals · G/Match ${fmt2(x.s.gpm)} · Win% ${fmtPct(x.s.winPct)}`)).join("")
      : `<div class="note">No data yet.</div>`);

  const topStreak = rows.slice().sort((a,b)=>(b.s.current-a.s.current)||(b.s.best-a.s.best)).slice(0,3);
  $("dashTopStreaks") && ($("dashTopStreaks").innerHTML =
    topStreak.length
      ? topStreak.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `Current: ${x.s.current} · Best: ${x.s.best} · Matches: ${x.s.matches}`)).join("")
      : `<div class="note">No data yet.</div>`);

  const topWin = rows.filter(x=>x.s.matches>=2).sort((a,b)=>(b.s.winPct-a.s.winPct)||(b.s.wins-a.s.wins)).slice(0,3);
  $("dashTopWinPct") && ($("dashTopWinPct").innerHTML =
    topWin.length
      ? topWin.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches} · Goals ${x.s.goals}`)).join("")
      : `<div class="note">Need at least 2 matches per player.</div>`);
}

function renderLeaderboard(stats) {
  const sortBy = $("lbSort")?.value || "winPct";
  const rows = buildRows(stats).sort(sorter(sortBy));
  const box = $("leaderboardList");
  if (!box) return;

  box.innerHTML = rows.length
    ? rows.map((r,i)=>`
      <div class="item">
        <div>
          <div class="name">${medal(i)} ${esc(r.name)}</div>
          <div class="meta">
            Matches <b>${r.matches}</b> · Wins <b>${r.wins}</b> · Goals <b>${r.goals}</b> ·
            Win% <b>${fmtPct(r.winPct)}</b> · G/Match <b>${fmt2(r.gpm)}</b> ·
            Streak <b>${r.curStreak}</b> (best ${r.bestStreak})
          </div>
        </div>
      </div>
    `).join("")
    : `<div class="note">No players yet.</div>`;
}

function renderTable(stats) {
  const sortBy = $("tableSort")?.value || "winPct";
  const rows = buildRows(stats).sort(sorter(sortBy));
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
    : `<tr><td colspan="9" class="noteCell">No players yet.</td></tr>`;
}

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

function buildRows(stats) {
  return players.map(p => {
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
  });
}

function sorter(k) {
  if (k === "name") return (a,b)=>a.name.localeCompare(b.name);
  const key = ({winPct:"winPct",goals:"goals",gpm:"gpm",wins:"wins",matches:"matches",curStreak:"curStreak",bestStreak:"bestStreak"}[k]) || "winPct";
  return (a,b)=> (Number(b[key]||0)-Number(a[key]||0)) || (b.goals-a.goals) || a.name.localeCompare(b.name);
}

function clampInt(v,min,max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function fmtPct(x){ return `${Math.round((Number(x)||0)*100)}%`; }
function fmt2(x){ return (Number(x)||0).toFixed(2); }
function medal(i){ return i===0?"🥇":i===1?"🥈":i===2?"🥉":""; }
function dashItem(t,m){ return `<div class="item"><div><div class="name">${t}</div><div class="meta">${m}</div></div></div>`; }
function esc(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
