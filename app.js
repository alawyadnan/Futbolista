import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* Firebase */
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

/* State */
let players = [];
let logs = [];

/* Passcode */
const PASSCODE = "1234";
const entered = prompt("Enter passcode (Cancel = View only)");
const editMode = entered === PASSCODE;

/* Navigation */
document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.getElementById("screen-"+btn.dataset.nav).classList.remove("hidden");

    document.querySelectorAll(".navbtn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });
});

/* Add Player */
document.getElementById("btnAddPlayer").addEventListener("click", async ()=>{
  if(!editMode) return alert("View only mode");
  const name=document.getElementById("playerName").value.trim();
  if(!name) return;
  await addDoc(playersRef,{name});
  document.getElementById("playerName").value="";
});

/* Listen */
onSnapshot(playersRef,snapshot=>{
  players=[];
  snapshot.forEach(doc=>{
    players.push({id:doc.id,...doc.data()});
  });
  render();
});

onSnapshot(logsRef,snapshot=>{
  logs=[];
  snapshot.forEach(doc=>{
    logs.push({id:doc.id,...doc.data()});
  });
  render();
});

/* Add Match */
window.addMatch=async function(playerId,goals,win){
  if(!editMode) return alert("View only");
  await addDoc(logsRef,{
    playerId,
    goals:Number(goals),
    win:win,
    date:new Date().toISOString().slice(0,10)
  });
};

/* Delete Player */
window.deletePlayer=async function(id){
  if(!editMode) return;
  await deleteDoc(doc(db,"players",id));
};

/* Stats */
function stats(id){
  const pLogs=logs.filter(l=>l.playerId===id);
  const matches=pLogs.length;
  const wins=pLogs.filter(l=>l.win).length;
  const goals=pLogs.reduce((s,l)=>s+Number(l.goals||0),0);
  const winPct=matches?((wins/matches)*100).toFixed(0):0;
  return{matches,wins,goals,winPct};
}

/* Render */
function render(){
  renderPlayers();
  renderDashboard();
}

function renderPlayers(){
  const list=document.getElementById("playersList");
  list.innerHTML=players.map(p=>{
    const s=stats(p.id);
    return`
      <div class="card">
        <b>${p.name}</b><br>
        Matches:${s.matches} | Wins:${s.wins} | Goals:${s.goals} | Win%:${s.winPct}%
        <br><br>
        ${editMode?`
          <button onclick="addMatch('${p.id}',1,true)">+Goal Win</button>
          <button onclick="addMatch('${p.id}',0,false)">Loss</button>
          <button onclick="deletePlayer('${p.id}')">Delete</button>
        `:""}
      </div>
    `;
  }).join("")||"No players";
}

function renderDashboard(){
  const dash=document.getElementById("dashboardTop");
  const ranked=[...players].sort((a,b)=>stats(b.id).goals-stats(a.id).goals);
  dash.innerHTML=ranked.slice(0,3).map((p,i)=>{
    const medal=i===0?"🥇":i===1?"🥈":"🥉";
    return`${medal} ${p.name} - ${stats(p.id).goals} Goals`;
  }).join("")||"No data";
}
