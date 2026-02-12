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
   Auth
========================= */
function mountAuthOverlay(){
  const entered = prompt("Enter passcode for edit mode (Cancel = View only)");
  if (entered === PASSCODE) {
    editMode = true;
    alert("Edit mode enabled");
  } else {
    alert("View mode only");
  }
}

/* =========================
   Navigation
========================= */
function setupNavigation(){
  const navButtons = document.querySelectorAll(".navbtn");
  const screens = document.querySelectorAll(".screen");

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      screens.forEach(s => s.classList.add("hidden"));
      const target = document.getElementById("screen-" + btn.dataset.nav);
      if (target) target.classList.remove("hidden");

      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/* =========================
   Firestore
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
   Add Player
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

      const playerId = document.getElementById("logPlayer")?.value;
      const goals = Number(document.getElementById("logGoals")?.value || 0);
      const win = document.getElementById("logWin")?.value === "win";

      if (!playerId) return alert("Pick a player");

      await addDoc(logsRef, {
        playerId,
        goals,
        win,
        date: new Date().toISOString().slice(0,10),
        createdAt: Date.now()
      });
    });
  }
}

/* =========================
   Stats
========================= */
function computeStats(playerId){
  const playerLogs = logs.filter(l => l.playerId === playerId);
  const matches = playerLogs.length;
  const wins = playerLogs.filter(l => l.win).length;
  const goals = playerLogs.reduce((sum,l)=>sum+Number(l.goals||0),0);
  const winPct = matches ? wins/matches : 0;

  return { matches, wins, goals, winPct };
}

/* =========================
   Render
========================= */
function renderAll(){
  renderPlayersList();
  renderKPIs();
}

function renderKPIs(){
  const kpiPlayers = document.getElementById("kpiPlayers");
  const kpiLogs = document.getElementById("kpiLogs");
  if (
