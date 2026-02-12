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

const PASSCODE = "1234"; // غيّره وقت ما تبغى

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");

/* =========================
   App State
========================= */
let editMode = false;
let players = [];
let logs = [];

/* =========================
   Boot
========================= */
document.addEventListener("DOMContentLoaded", () => {
  mountAuthOverlay();     // شاشة الكود داخل الصفحة
  setupNavigation();      // التنقل
  wireUIActions();        // أزرار الإضافة من واجهتك (Players/Matches)
  listenFirestore();      // سحب البيانات لايف
});

/* =========================
   Auth Overlay (No prompt)
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
      color:#eaf0ff;
      box-shadow: 0 20px 60px rgba(0,0,0,.55);
      padding:16px;
    ">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <div style="
          width:38px;height:38px;border-radius:12px;
          display:grid;place-items:center;
          background:rgba(255,255,255,.08);
          border:1px solid rgba(255,255,255,.10);
        ">⚽</div>
        <div>
          <div style="font-weight:900; font-size:16px;">Futbolista</div>
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
          color:#eaf0ff;
          outline:none;
        "
      />

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button id="btnViewOnly" style="
          flex:1; padding:12px; border-radius:14px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          color:#eaf0ff; font-weight:900; cursor:pointer;
        ">View only</button>

        <button id="btnUnlockEdit" style="
          flex:1; padding:12px; border-radius:14px;
          border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.10);
          color:#eaf0ff; font-weight:900; cursor:pointer;
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
   Navigation (fix)
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
   Wire UI buttons (uses your existing HTML ids)
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

/* =========================
   Lock edit controls when view-only
========================= */
function applyEditLock(){
  const toDisable = ["btnAddPlayer","btnAddLog","btnReset"];
  toDisable.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !editMode;
  });
}

/* =========================
   Rendering (minimal + fixes dropdowns)
   (يبقي صفحاتك شغّالة + يعبّي القوائم)
========================= */
function renderAll(){
  fillPlayerDropdown();
  renderKPIs();
  renderLogsListMinimal();
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

function renderLogsListMinimal(){
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

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
