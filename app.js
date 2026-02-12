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
function setup
