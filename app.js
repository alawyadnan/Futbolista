import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const $ = (id) => document.getElementById(id);

window.__adminLogin = async () => {
  try {
    if (auth.currentUser) { await signOut(auth); return; }
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

window.__exportNow = () => { if (isAdmin) exportJSON(); };

document.addEventListener("DOMContentLoaded", () => {
  // default date
  if ($("logDate")) $("logDate").value = new Date().toISOString().slice(0, 10);

  // NAV: show ONE screen only
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.dataset.nav;
      if (btn.dataset.admin === "1" && !isAdmin) return;
      showScreen(target);
      setActiveNav(target);
    });
  });

  // Admin actions
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
    const win = ($("logWin")?.value === "win");
    const date = $("logDate")?.value || new Date().toISOString().slice(0, 10);

    await addDoc(logsRef, { playerId, goals, win, date, createdAt: Date.now() });
  });

  $("lbSort")?.addEventListener("change", renderAll);
  $("tableSort")?.addEventListener("change", renderAll);

  $("btnExport")?.addEventListener("click", () => { if (isAdmin) exportJSON(); });
  $("btnReset")?.addEventListener("click", async () => {
    if (!isAdmin) return alert("Read only");
    const ok = confirm("Delete ALL data? This cannot be undone.");
    if (!ok) return;
    await resetAllData();
  });

  // AUTH state
  onAuthStateChanged(auth, (user) => {
    const email = (user?.email || "").trim().toLowerCase();
    isAdmin = !!user && email === ADMIN_EMAIL.trim().toLowerCase();

    document.body.classList.toggle("is-admin", isAdmin);

    const btn = $("btnAdminLogin");
    if (btn) btn.textContent = isAdmin ? "Logout" : "Admin Login";

    // إذا كان زائر وفتح صفحة أدمن، رجعه داشبورد
    const openAdminScreen = document.querySelector(".screen:not(.hidden)[data-admin='1']");
    if (openAdminScreen && !isAdmin) {
      showScreen("dashboard");
      setActiveNav("dashboard");
    }
  });

  // Firestore live
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

  // Start at dashboard
  showScreen("dashboard");
  setActiveNav("dashboard");
});

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(`screen-${name}`)?.classList.remove("hidden");
}

function setActiveNav(name) {
  document.querySelectorAll(".navbtn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.navbtn[data-nav="${name}"]`)?.classList.add("active");
}

function blankStats(){ return { matches:0,wins:0,goals:0,winPct:0,gpm:0,current:0,best:0 }; }

function computeAllStats(){
  const byId = {};
  players.forEach(p => byId[p.id] = blankStats());

  const grouped = {};
  players.forEach(p => grouped[p.id] = []);
  logs.forEach(l => { if (grouped[l.playerId]) grouped[l.playerId].push(l); });

  players.forEach(p => {
    const arr = (grouped[p.id]||[]).slice().sort((a,b)=>{
      const da=String(a.date||""), db=String(b.date||"");
      if (da<db) return -1; if (da>db) return 1;
      return (a.createdAt||0)-(b.createdAt||0);
    });
    const matches = arr.length;
    let wins=0, goals=0;
    arr.forEach(l=>{ wins += l.win?1:0; goals += Number(l.goals||0); });
    const winPct = matches? wins/matches : 0;
    const gpm = matches? goals/matches : 0;

    let best=0, run=0;
    arr.forEach(l=>{ if(l.win){ run++; best=Math.max(best,run);} else run=0; });

    let current=0;
    for(let i=arr.length-1;i>=0;i--){ if(arr[i].win) current++; else break; }

    byId[p.id] = { matches,wins,goals,winPct,gpm,current,best };
  });

  return byId;
}

function renderAll(){
  $("kpiPlayers") && ($("kpiPlayers").textContent = String(players.length));
  $("kpiLogs") && ($("kpiLogs").textContent = String(logs.length));

  // dropdown
  const sel = $("logPlayer");
  if (sel){
    const cur = sel.value;
    sel.innerHTML = players.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""))
      .map(p=>`<option value="${p.id}">${esc(p.name||"")}</option>`).join("");
    if (cur && players.some(p=>p.id===cur)) sel.value = cur;
  }

  const stats = computeAllStats();
  renderDashboard(stats);
  renderLeaderboard(stats);
  renderTable(stats);
  renderPlayers(stats);
  renderLogs();
}

function renderDashboard(stats){
  const rows = players.map(p=>({p,s:stats[p.id]||blankStats()}));
  const topGoals = rows.slice().sort((a,b)=>(b.s.goals-a.s.goals)||(b.s.gpm-a.s.gpm)).slice(0,3);
  $("dashTopScorers") && ($("dashTopScorers").innerHTML =
    topGoals.length ? topGoals.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `${x.s.goals} goals · G/Match ${fmt2(x.s.gpm)} · Win% ${fmtPct(x.s.winPct)}`)).join("")
                    : `<div class="note">No data yet.</div>`);

  const topStreak = rows.slice().sort((a,b)=>(b.s.current-a.s.current)||(b.s.best-a.s.best)).slice(0,3);
  $("dashTopStreaks") && ($("dashTopStreaks").innerHTML =
    topStreak.length ? topStreak.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `Current: ${x.s.current} · Best: ${x.s.best} · Matches: ${x.s.matches}`)).join("")
                     : `<div class="note">No data yet.</div>`);

  const topWin = rows.filter(x=>x.s.matches>=2).sort((a,b)=>(b.s.winPct-a.s.winPct)||(b.s.wins-a.s.wins)).slice(0,3);
  $("dashTopWinPct") && ($("dashTopWinPct").innerHTML =
    topWin.length ? topWin.map((x,i)=>dashItem(`${medal(i)} ${esc(x.p.name)}`, `Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches} · Goals ${x.s.goals}`)).join("")
                  : `<div class="note">Need at least 2 matches per player.</div>`);
}

function renderLeaderboard(stats){
  const sortBy = $("lbSort")?.value || "winPct";
  const rows = buildRows(stats).sort(sorter(sortBy));
  const box = $("leaderboardList");
  if (!box) return;
  box.innerHTML = rows.length ? rows.map((r,i)=>`
    <div class="item">
      <div>
        <div class="name">${medal(i)} ${esc(r.name)}</div>
        <div class="meta">Matches <b>${r.matches}</b> · Wins <b>${r.wins}</b> · Goals <b>${r.goals}</b> · Win% <b>${fmtPct(r.winPct)}</b> · G/Match <b>${fmt2(r.gpm)}</b> · Streak <b>${r.curStreak}</b> (best ${r.bestStreak})</div>
      </div>
    </div>`).join("")
    : `<div class="note">No players yet.</div>`;
}

function renderTable(stats){
  const sortBy = $("tableSort")?.value || "winPct";
  const rows = buildRows(stats).sort(sorter(sortBy));
  const body = $("tableBody");
  if (!body) return;
  body.innerHTML = rows.length ? rows.map((r,idx)=>`
    <tr>
      <td>${idx+1}</td><td>${esc(r.name)}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.goals}</td>
      <td>${fmtPct(r.winPct)}</td><td>${fmt2(r.gpm)}</td><td>${r.curStreak}</td><td>${r.bestStreak}</td>
    </tr>`).join("")
    : `<tr><td colspan="9" class="noteCell">No players yet.</td></tr>`;
}

function renderPlayers(stats){
  const box = $("playersList");
  if (!box) return;
  const html = players.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(p=>{
    const s=stats[p.id]||blankStats();
    return `<div class="item"><div><div class="name">${esc(p.name||"")}</div>
      <div class="meta">Matches <b>${s.matches}</b> · Wins <b>${s.wins}</b> · Goals <b>${s.goals}</b> · Win% <b>${fmtPct(s.winPct)}</b> · G/Match <b>${fmt2(s.gpm)}</b> · Streak <b>${s.current}</b> (best ${s.best})</div>
    </div></div>`;
  }).join("");
  box.innerHTML = html || `<div class="note">No players yet.</div>`;
}

function renderLogs(){
  const box = $("logsList");
  if (!box) return;
  box.innerHTML = logs.slice(0,30).map(l=>{
    const p = players.find(x=>x.id===l.playerId);
    const name = p? p.name : "(Unknown)";
    return `<div class="item"><div><div class="name">${esc(name)} — ${l.win?"✅ Win":"❌ Loss"}</div><div class="meta">${esc(l.date||"")} · Goals: <b>${Number(l.goals||0)}</b></div></div></div>`;
  }).join("") || `<div class="note">No entries yet.</div>`;
}

function exportJSON(){
  const data={exportedAt:new Date().toISOString(),players,logs};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`ftbll_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function resetAllData(){
  const logsSnap=await getDocs(logsRef);
  for(const d of logsSnap.docs) await deleteDoc(doc(db,"logs",d.id));
  const playersSnap=await getDocs(playersRef);
  for(const d of playersSnap.docs) await deleteDoc(doc(db,"players",d.id));
}

function buildRows(stats){
  return players.map(p=>{
    const s=stats[p.id]||blankStats();
    return { name:p.name||"", matches:s.matches,wins:s.wins,goals:s.goals,winPct:s.winPct,gpm:s.gpm,curStreak:s.current,bestStreak:s.best };
  });
}
function sorter(k){
  if(k==="name") return (a,b)=>a.name.localeCompare(b.name);
  const key=({winPct:"winPct",goals:"goals",gpm:"gpm",wins:"wins",matches:"matches",curStreak:"curStreak",bestStreak:"bestStreak"}[k])||"winPct";
  return (a,b)=> (Number(b[key]||0)-Number(a[key]||0)) || (b.goals-a.goals) || a.name.localeCompare(b.name);
}
function clampInt(v,min,max){ const n=Math.floor(Number(v)); if(!Number.isFinite(n)) return min; return Math.max(min,Math.min(max,n)); }
function fmtPct(x){ return `${Math.round((Number(x)||0)*100)}%`; }
function fmt2(x){ return (Number(x)||0).toFixed(2); }
function medal(i){ return i===0?"🥇":i===1?"🥈":i===2?"🥉":""; }
function dashItem(t,m){ return `<div class="item"><div><div class="name">${t}</div><div class="meta">${m}</div></div></div>`; }
function esc(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
