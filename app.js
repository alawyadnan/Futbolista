import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  authDomain: "el-futbolistas.firebaseapp.com",
  projectId: "el-futbolistas",
  storageBucket: "el-futbolistas.appspot.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const playersRef = collection(db, "players");

let players = [];

/* PASSCODE */
const PASSCODE = "0550";
const entered = prompt("Enter passcode to edit (Cancel = View only)");
const editMode = entered === PASSCODE;

/* NAVIGATION */
document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.getElementById("screen-"+btn.dataset.nav).classList.remove("hidden");

    document.querySelectorAll(".navbtn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });
});

/* ADD PLAYER */
document.getElementById("btnAddPlayer").addEventListener("click", async ()=>{
  if(!editMode) return alert("View only mode");

  const name = document.getElementById("playerName").value.trim();
  if(!name) return;

  await addDoc(playersRef, { name });
  document.getElementById("playerName").value="";
});

/* LISTEN */
onSnapshot(playersRef, snapshot=>{
  players=[];
  snapshot.forEach(doc=>{
    players.push({ id:doc.id, ...doc.data() });
  });
  renderPlayers();
  renderDashboard();
});

function renderPlayers(){
  const list=document.getElementById("playersList");
  list.innerHTML=players.map(p=>`
    <div class="card">
      ${p.name}
      ${editMode ? `<button onclick="deletePlayer('${p.id}')">Delete</button>`:""}
    </div>
  `).join("");
}

window.deletePlayer=async function(id){
  if(!editMode) return;
  await deleteDoc(doc(db,"players",id));
};

function renderDashboard(){
  const dash=document.getElementById("dashboardTop");
  dash.innerHTML=players.map(p=>`<div>${p.name}</div>`).join("");
}
