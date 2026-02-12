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
  storageBucket: "el-futbolistas.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");

/* =========================
   Passcode
========================= */

const PASSCODE = "1234";
let editMode = false;

/* =========================
   Simple Login Screen
========================= */

function showLogin() {
  const entered = prompt("Enter passcode for edit mode (Cancel = View only)");

  if (entered === PASSCODE) {
    editMode = true;
    alert("Edit mode enabled");
  } else {
    alert("View mode only");
  }

  initApp();
}

/* =========================
   State
========================= */

let players = [];
let logs = [];

/* =========================
   Init
========================= */

function initApp() {
  onSnapshot(query(playersRef), snapshot => {
    players = [];
    snapshot.forEach(doc => {
      players.push({ id: doc.id, ...doc.data() });
    });
    renderAll();
  });

  onSnapshot(query(logsRef, orderBy("createdAt", "desc")), snapshot => {
    logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    renderAll();
  });

  setupNavigation();
}

/* =========================
   Navigation
========================= */

function setupNavigation() {
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
      document.getElementById("screen-" + btn.dataset.nav).classList.remove("hidden");

      document.querySelectorAll(".navbtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/* =========================
   Add Player
========================= */

window.addPlayer = async function(name) {
  if (!editMode) return alert("View mode");

  await addDoc(playersRef, {
    name,
    createdAt: Date.now()
  });
};

/* =========================
   Add Log
================
