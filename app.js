// ==========================
// Firebase Setup
// ==========================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  projectId: "el-futbolistas"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");


// ==========================
// Simple Passcode
// ==========================

const PASSCODE = "1234";
let editMode = false;

const entered = prompt("Enter passcode to edit (Cancel = view only)");

if (entered === PASSCODE) {
  editMode = true;
  alert("Edit mode enabled");
} else {
  alert("View mode only");
}


// ==========================
// State
// ==========================

let players = [];
let logs = [];


// ==========================
// Load Data Live
// ==========================

onSnapshot(playersRef, snapshot => {
  players = [];
  snapshot.forEach(doc => {
    players.push({ id: doc.id, ...doc.data() });
  });
  render();
});

onSnapshot(logsRef, snapshot => {
  logs = [];
  snapshot.forEach(doc => {
    logs.push({ id: doc.id, ...doc.data() });
  });
  render();
});


// ==========================
// Add Player
// ==========================

window.addPlayer = async function(name) {
  if (!editMode) return alert("View mode");
  await addDoc(playersRef, { name });
};


// ==========================
// Add Match Entry
// ==========================

window.addLog = async function(playerId, goals, win) {
  if (!editMode) return alert("View mode");
  await addDoc(logsRef, {
    playerId,
    goals,
    win,
    date: new Date()
  });
};


// ==========================
// Render
// ==========================

function render() {
  console.log("Players:", players);
  console.log("Logs:", logs);
}
