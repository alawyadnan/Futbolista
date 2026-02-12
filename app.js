import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ========= Firebase Config =========
   (مشتق بشكل آمن من projectId)
*/
const projectId = "el-futbolistas";
const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: `${projectId}.appspot.com`,
};

const PASSCODE = "1234"; // غيّره إذا تبغى

// ====== UI: Simple in-page passcode ======
const auth = {
  editMode: false,
};

function mountPasscodeScreen() {
  const wrap = document.createElement("div");
  wrap.id = "passcodeOverlay";
  wrap.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    display:flex; align-items:center; justify-content:center;
    padding:18px;
    background: rgba(0,0,0,.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  `;

  wrap.innerHTML = `
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
        <button id="btnView" style="
          flex:1;
          padding:12px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          color:#eaf0ff;
          font-weight:900;
          cursor:pointer;
        ">View only</button>

        <button id="btnEdit" style="
          flex:1;
          padding:12px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.10);
          color:#eaf0ff;
          font-weight:900;
          cursor:pointer;
        ">Unlock edit</button>
      </div>

      <div id="authMsg" style="margin-top:10px; font-size:12px; opacity:.75;"></div>
    </div>
  `;

  document.body.appendChild(wrap);

  const input = wrap.querySelector("#passcodeInput");
  const msg = wrap.querySelector("#authMsg");
  const btnView = wrap.querySelector("#btnView");
  const btnEdit = wrap.querySelector("#btnEdit");

  btnView.onclick = () => {
    auth.editMode = false;
    wrap.remove();
    startFirebaseAndApp();
  };

  btnEdit.onclick = () => {
    const v = (input.value || "").trim();
    if (v === PASSCODE) {
      auth.editMode = true;
      wrap.remove();
      startFirebaseAndApp();
    } else {
      msg.textContent = "Wrong code. Try again, or choose View only.";
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnEdit.click();
  });
}

// ====== Firebase + data (global) ======
let db, playersRef, logsRef;
let players = [];
let logs = [];

function startFirebaseAndApp() {
  // Firebase init AFTER choosing mode
  const fbApp = initializeApp(firebaseConfig);
  db = getFirestore(fbApp);

  playersRef = collection(db, "players");
  logsRef = collection(db, "logs");

  // Live listeners
  onSnapshot(query(playersRef), (snap) => {
    players = [];
    snap.forEach(d => players.push({ id: d.id, ...d.data() }));
    renderAllIfExists();
  });

  onSnapshot(query(logsRef, orderBy("createdAt", "desc")), (snap) => {
    logs = [];
    snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
    renderAllIfExists();
  });

  // Disable editing UI if view only
  lockOrUnlockUI();
}

function lockOrUnlockUI() {
  // لو view only: عطّل أزرار الإضافة/الحذف (لو موجودة في صفحتك)
  const disable = !auth.editMode;
  const idsToDisable = ["btnAddPlayer", "btnAddLog", "btnReset", "btnExport2"];
  idsToDisable.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disable;
  });

  // نخلي Export شغال للجميع
  const ex = document.getElementById("btnExport");
  if (ex) ex.disabled = false;
}

/* ========= عمليات الكتابة (Edit only) ========= */
window.fbAddPlayer = async function(name) {
  if (!auth.editMode) return alert("View only");
  const n = (name || "").trim();
  if (!n) return;
  await addDoc(playersRef, { name: n, createdAt: Date.now() });
};

window.fbAddLog = async function({ playerId, goals, win, date }) {
  if (!auth.editMode) return alert("View only");
  await addDoc(logsRef, {
    playerId,
    goals: Number(goals) || 0,
    win: !!win,
    date: date || new Date().toISOString().slice(0,10),
    createdAt: Date.now()
  });
};

window.fbDeleteLog = async function(logId) {
  if (!auth.editMode) return alert("View only");
  await deleteDoc(doc(db, "logs", logId));
};

/* ========= ربطه بواجهتك الحالية =========
   إذا عندك functions renderAll() موجودة في كودك القديم،
   هنا نستدعيها فقط عندما تكون موجودة.
*/
function renderAllIfExists(){
  // إذا عندك ملفاتك السابقة فيها renderAll، خله يشتغل
  if (typeof window.renderAll === "function") {
    window.renderAll(players, logs, auth.editMode);
  } else {
    // مؤقت: لا يطلع أبيض—على الأقل نتأكد البيانات توصل
    console.log("LIVE players:", players);
    console.log("LIVE logs:", logs);
  }
}

// Start
mountPasscodeScreen();
