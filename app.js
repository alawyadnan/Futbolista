import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const playersRef = collection(db, "players");
const logsRef = collection(db, "logs");

/* =========================
   State
========================= */
let players = [];
let logs = [];

const PASSCODE = "0550";
const entered = prompt("Enter passcode to edit (Cancel = View only)");
const editMode = entered === PASSCODE;

/* =========================
   Navigation
========================= */
document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.getElementById("screen-"+btn.dataset.nav).classList.remove("hidden");

    document.querySelectorAll(".navbtn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });
});

/* =========================
   Add Player
========================= */
document.getElementById("btnAddPlayer").addEventListener("click", async ()=>{
  if(!editMode) return alert("View only mode");

  const name = document.getElementById("playerName").value.trim();
  if(!name) return;

  await addDoc(playersRef, { name });
  document.getElementById("playerName").value="";
});

/* =========================
   Listen
========================= */
onSnapshot(playersRef, snapshot=>{
  players=[];
  snapshot.forEach(doc=>{
    players.push({ id:doc.id, ...doc.data() });
  });
  renderAll();
});

onSnapshot(logsRef, snapshot=>{
  logs=[];
  snapshot.forEach(doc=>{
    logs.push({ id:doc.id, ...doc.data() });
  });
  renderAll();
});

/* =========================
   Add Match (per player)
========================= */
window.addMatch = async function(playerId, goals, win){
  if(!editMode) return alert("View only");

  await addDoc(logsRef,{
    playerId,
    goals:Number(goals),
    win:win === true,
    date: new Date().toISOString().slice(0,10)
  });
};

/* =========================
   Stats
========================= */
function computeStats(playerId){
  const playerLogs = logs.filter(l=>l.playerId===playerId);
  const matches = playerLogs.length;
  const wins = playerLogs.filter(l=>l.win).length;
  const goals = playerLogs.reduce((sum,l)=>sum+Number(l.goals||0),0);

  const winPct = matches ? (wins/matches)*100 : 0;
  const goalsPerMatch = matches ? goals/matches : 0;

  return {
    matches,
    wins,
    goals,
    winPct: winPct.toFixed(0),
    goalsPerMatch: goalsPerMatch.toFixed(2)
  };
}

/* =========================
   Render
========================= */
function renderAll(){
  renderPlayers();
  renderDashboard();
}

function renderPlayers(){
  const list=document.getElementById("playersList");
  if(!list) return;

  list.innerHTML=players.map(p=>{
    const s=computeStats(p.id);
    return `
      <div class="card">
        <b>${p.name}</b><br>
        Matches: ${s.matches} |
        Wins: ${s.wins} |
        Goals: ${s.goals} |
        Win%: ${s.winPct}% |
        G/Match: ${s.goalsPerMatch}
        <br><br>
        ${editMode ? `
          <button onclick="addMatch('${p.id}',1,true)">+1 Goal (Win)</button>
          <button onclick="addMatch('${p.id}',0,false)">Loss</button>
          <button onclick="deletePlayer('${p.id}')">Delete</button>
        ` : ``}
      </div>
    `;
  }).join("");
}

window.deletePlayer=async function(id){
  if(!editMode) return;
  await deleteDoc(doc(db,"players",id));
};

function renderDashboard(){
  const dash=document.getElementById("dashboardTop");
  if(!dash) return;

  const ranked=[...players].sort((a,b)=>{
    const sa=computeStats(a.id);
    const sb=computeStats(b.id);
    return sb.goals - sa.goals;
  });

  dash.innerHTML=ranked.map(p=>{
    const s=computeStats(p.id);
    return `<div>${p.name} - ${s.goals} Goals</div>`;
  }).join("");
}
