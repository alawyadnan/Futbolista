import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* =========================================================
   FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyA6rH6OY8e-qr3-jaJX0irmOjoySiL8VAg",
  authDomain: "el-futbolistas.firebaseapp.com",
  projectId: "el-futbolistas",
  storageBucket: "el-futbolistas.appspot.com"
};

const ADMIN_EMAIL = "admin@ftbll.live";


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);


setPersistence(
  auth,
  browserLocalPersistence
).catch(console.warn);


const playersRef = collection(
  db,
  "players"
);

const logsRef = collection(
  db,
  "logs"
);


/* =========================================================
   STATE
========================================================= */

let players = [];

let rawLogs = [];

let isAdmin = false;

let currentProfileId = null;

let renderQueued = false;

let addPlayerBusy = false;

let addLogBusy = false;

let showPastMonths = false;

let compareOptionsSignature = "";

let logPlayerOptionsSignature = "";

let model = emptyModel();


const $ = (id) => (
  document.getElementById(id)
);


/* =========================================================
   ADMIN LOGIN
========================================================= */

window.__adminLogin = async () => {

  try {

    if (auth.currentUser) {

      await signOut(auth);

      return;

    }


    const email = prompt(
      "Admin Email:"
    );


    if (!email) {

      return;

    }


    const password = prompt(
      "Admin Password:"
    );


    if (!password) {

      return;

    }


    await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );


  } catch (e) {

    alert(
      "Login failed:\n" +
      (e?.message || e)
    );

    console.error(e);

  }

};


window.__exportNow = () => {

  if (isAdmin) {

    exportJSON();

  }

};


/* =========================================================
   STARTUP
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    if ($("logDate")) {

      $("logDate").value =
        localISODate();

    }


    document
      .querySelectorAll(".navbtn")
      .forEach(btn => {

        btn.addEventListener(
          "click",
          (e) => {

            e.preventDefault();


            const target =
              btn.dataset.nav;


            if (
              btn.dataset.admin === "1" &&
              !isAdmin
            ) {

              return;

            }


            showScreen(target);

            setActiveNav(target);

          }
        );

      });


    $("playerCards")?.addEventListener(
      "click",
      (e) => {

        const card =
          e.target.closest(
            "[data-player-id]"
          );


        if (!card) {

          return;

        }


        openProfile(
          card.getAttribute(
            "data-player-id"
          )
        );

      }
    );


    $("btnProfileBack")?.addEventListener(
      "click",
      () => {

        currentProfileId = null;

        showScreen(
          "playerstats"
        );

        setActiveNav(
          "playerstats"
        );

      }
    );


    $("cmpPlayerA")?.addEventListener(
      "change",
      renderCompare
    );


    $("cmpPlayerB")?.addEventListener(
      "change",
      renderCompare
    );


    $("btnAddPlayer")?.addEventListener(
      "click",
      addPlayerSafely
    );


    $("btnAddLog")?.addEventListener(
      "click",
      addLogSafely
    );


    $("lbSort")?.addEventListener(
      "change",
      () => {

        renderLeaderboard();

      }
    );


    $("tableSort")?.addEventListener(
      "change",
      () => {

        renderTable();

      }
    );


    $("btnExport")?.addEventListener(
      "click",
      () => {

        if (isAdmin) {

          exportJSON();

        }

      }
    );


    $("btnReset")?.addEventListener(
      "click",
      async () => {

        if (!isAdmin) {

          return alert(
            "Read only"
          );

        }


        const ok = confirm(
          "Delete ALL data? This cannot be undone."
        );


        if (!ok) {

          return;

        }


        await resetAllData();

      }
    );


    onAuthStateChanged(
      auth,
      (user) => {

        const email =
          (
            user?.email || ""
          )
          .trim()
          .toLowerCase();


        isAdmin =
          !!user &&
          email ===
          ADMIN_EMAIL
            .trim()
            .toLowerCase();


        document.body.classList.toggle(
          "is-admin",
          isAdmin
        );


        const btn =
          $("btnAdminLogin");


        if (btn) {

          btn.textContent =
            isAdmin
              ? "Logout"
              : "Admin Login";

        }


        const openAdminScreen =
          document.querySelector(
            ".screen:not(.hidden)[data-admin='1']"
          );


        if (
          openAdminScreen &&
          !isAdmin
        ) {

          showScreen(
            "dashboard"
          );

          setActiveNav(
            "dashboard"
          );

        }

      }
    );


    /*
      IMPORTANT:

      We intentionally do NOT use
      orderBy("createdAt").

      This means old Firestore documents
      without createdAt are still loaded.
    */

    onSnapshot(
      playersRef,

      (snap) => {

        players =
          snap.docs
            .map(d => ({
              id: d.id,
              ...d.data()
            }))
            .sort(
              (a, b) =>

                Number(
                  a.createdAt || 0
                )
                -
                Number(
                  b.createdAt || 0
                )

                ||

                String(
                  a.name || ""
                )
                .localeCompare(
                  String(
                    b.name || ""
                  )
                )

            );


        scheduleRender();

      },

      handleSnapshotError
    );


    onSnapshot(
      logsRef,

      (snap) => {

        rawLogs =
          snap.docs
            .map(d => ({
              id: d.id,
              ...d.data()
            }))
            .sort(
              compareRawLogsNewestFirst
            );


        scheduleRender();

      },

      handleSnapshotError
    );


    showScreen(
      "dashboard"
    );


    setActiveNav(
      "dashboard"
    );

  }
);


/* =========================================================
   SAFE INPUT
========================================================= */

async function addPlayerSafely() {

  if (!isAdmin) {

    return alert(
      "Read only"
    );

  }


  if (addPlayerBusy) {

    return;

  }


  const name =
    (
      $("playerName")?.value || ""
    )
    .trim();


  if (!name) {

    return alert(
      "Enter a name"
    );

  }


  const exists =
    players.some(
      p =>

        String(
          p.name || ""
        )
        .trim()
        .toLowerCase()

        ===

        name.toLowerCase()
    );


  if (exists) {

    return alert(
      "A player with this name already exists."
    );

  }


  const btn =
    $("btnAddPlayer");


  addPlayerBusy = true;


  setButtonBusy(
    btn,
    true,
    "Adding..."
  );


  try {

    await addDoc(
      playersRef,
      {
        name,
        createdAt: Date.now()
      }
    );


    if ($("playerName")) {

      $("playerName").value = "";

    }


  } catch (e) {

    console.error(e);


    alert(
      "Could not add player. Please try again."
    );


  } finally {

    addPlayerBusy = false;


    setButtonBusy(
      btn,
      false,
      "Add"
    );

  }

}


/* =========================================================
   SAFE MATCH ENTRY
========================================================= */

async function addLogSafely() {

  if (!isAdmin) {

    return alert(
      "Read only"
    );

  }


  /*
    Protect against rapid double-click
    creating duplicate Firestore docs.
  */

  if (addLogBusy) {

    return;

  }


  const playerId =
    $("logPlayer")?.value || "";


  if (!playerId) {

    return alert(
      "Pick a player"
    );

  }


  const goals =
    clampInt(
      $("logGoals")?.value,
      0,
      99
    );


  const result =
    $("logResult")?.value
    ||
    "win";


  const side =
    $("logSide")?.value
    ||
    "A";


  const ownGoal =
    (
      $("logGoalType")?.value
      ||
      "normal"
    )
    ===
    "own";


  const date =
    $("logDate")?.value
    ||
    localISODate();


  /*
    Existing raw entries for
    this player + match.
  */

  const samePlayerMatch =
    rawLogs.filter(
      l =>

        String(
          l.playerId
        )
        ===
        String(
          playerId
        )

        &&

        String(
          l.date || ""
        )
        .trim()

        ===
        date
    );


  /*
    Normal + Own Goal is allowed.

    Normal + Normal is NOT allowed.

    Own Goal + Own Goal is NOT allowed.
  */

  const sameTypeExists =
    samePlayerMatch.some(
      l =>
        isOwnGoal(l)
        ===
        ownGoal
    );


  if (sameTypeExists) {

    const typeName =
      ownGoal
        ? "Own Goal"
        : "Normal";


    return alert(
      `${typeName} entry already exists for this player in this match.`
    );

  }


  /*
    If the other goal type
    already exists, result/team
    must remain identical.
  */

  if (samePlayerMatch.length) {

    const existing =
      samePlayerMatch
        .slice()
        .sort(
          compareRawLogsNewestFirst
        )[0];


    if (
      normalizeResult(existing)
      !==
      result

      ||

      normalizeSide(existing)
      !==
      side
    ) {

      return alert(
        "This player already has an entry for this match. Team and result must match the existing entry."
      );

    }

  }


  const btn =
    $("btnAddLog");


  addLogBusy = true;


  setButtonBusy(
    btn,
    true,
    "Saving..."
  );


  try {

    await addDoc(
      logsRef,
      {
        playerId,
        goals,
        result,
        side,
        ownGoal,
        date,
        createdAt: Date.now()
      }
    );


  } catch (e) {

    console.error(e);


    alert(
      "Could not add entry. Please try again."
    );


  } finally {

    addLogBusy = false;


    setButtonBusy(
      btn,
      false,
      "Add Entry"
    );

  }

}


function setButtonBusy(
  btn,
  busy,
  text
) {

  if (!btn) {

    return;

  }


  btn.disabled =
    busy;


  btn.textContent =
    text;

}


/* =========================================================
   FIREBASE ERROR
========================================================= */

function handleSnapshotError(
  error
) {

  console.error(
    "Firebase snapshot error:",
    error
  );

}


/* =========================================================
   RENDER QUEUE
========================================================= */

function scheduleRender() {

  if (renderQueued) {

    return;

  }


  renderQueued = true;


  const run = () => {

    renderQueued = false;

    renderAll();

  };


  /*
    Coalesce multiple Firebase updates
    into one UI render.
  */

  if (
    typeof requestAnimationFrame
    ===
    "function"
  ) {

    requestAnimationFrame(
      run
    );

  } else {

    setTimeout(
      run,
      0
    );

  }

}


/* =========================================================
   NAVIGATION
========================================================= */

function showScreen(
  name
) {

  document
    .querySelectorAll(".screen")
    .forEach(
      s =>
        s.classList.add(
          "hidden"
        )
    );


  document
    .getElementById(
      `screen-${name}`
    )
    ?.classList
    .remove(
      "hidden"
    );

}


function setActiveNav(
  name
) {

  document
    .querySelectorAll(
      ".navbtn"
    )
    .forEach(
      b =>
        b.classList.remove(
          "active"
        )
    );


  const el =
    document.querySelector(
      `.navbtn[data-nav="${name}"]`
    );


  el?.classList.add(
    "active"
  );


  const scroller =
    document.querySelector(
      ".bottomnav-inner"
    );


  if (
    scroller &&
    el &&
    scroller.scrollWidth >
    scroller.clientWidth
  ) {

    const left =
      el.offsetLeft
      -
      (
        scroller.clientWidth
        /
        2
      )
      +
      (
        el.clientWidth
        /
        2
      );


    scroller.scrollTo(
      {
        left:
          Math.max(
            0,
            left
          ),

        behavior:
          "smooth"
      }
    );

  }

}


/* =========================================================
   LEGACY SUPPORT
========================================================= */

function normalizeResult(
  l
) {

  if (
    l?.result === "win"
    ||
    l?.result === "draw"
    ||
    l?.result === "loss"
  ) {

    return l.result;

  }


  /*
    Old logs used:
    win: true / false
  */

  if (
    typeof l?.win
    ===
    "boolean"
  ) {

    return l.win
      ? "win"
      : "loss";

  }


  return "loss";

}


function normalizeSide(
  l
) {

  if (
    l?.side === "A"
    ||
    l?.side === "B"
  ) {

    return l.side;

  }


  /*
    Legacy fallback.
  */

  const r =
    normalizeResult(l);


  if (
    r === "win"
  ) {

    return "A";

  }


  if (
    r === "loss"
  ) {

    return "B";

  }


  return "A";

}


function isOwnGoal(
  l
) {

  return !!l?.ownGoal;

}


/* =========================================================
   MATCH ID
========================================================= */

function matchKeyOf(
  l
) {

  const date =
    String(
      l?.date || ""
    )
    .trim();


  /*
    Forward compatible.

    If matchId is added someday,
    the engine already supports it.

    Current data continues using date.
  */

  const matchId =
    String(
      l?.matchId || ""
    )
    .trim();


  return (
    matchId
    ||
    date
  );

}


/* =========================================================
   STATS MODEL
========================================================= */

function emptyStats() {

  return {

    matches: 0,

    wins: 0,

    draws: 0,

    losses: 0,

    goals: 0,

    winPct: 0,

    gpm: 0,

    current: 0,

    best: 0

  };

}


function emptyModel() {

  return {

    participations: [],

    byPlayer:
      new Map(),

    byMatch:
      new Map(),

    matchSummaries:
      new Map(),

    stats: {},

    forms: {},

    totalMatches: 0,

    minEligibleMatches: 1,

    eligibleIds:
      new Set()

  };

}


/* =========================================================
   CORE DATA ENGINE
========================================================= */

function buildDataModel() {

  /*
    This is the most important change.

    Firestore RAW entries are converted
    into one Participation per:

    MATCH + PLAYER

    Example:

    Ali normal goal entry
    +
    Ali own goal entry

    becomes:

    ONE match participation
    for Ali.
  */

  const participationMap =
    new Map();


  /*
    Oldest → newest.

    If old duplicate entries contain
    conflicting metadata, latest metadata
    becomes authoritative.
  */

  const ordered =
    rawLogs
      .slice()
      .sort(
        compareRawLogsOldestFirst
      );


  for (
    const log
    of
    ordered
  ) {

    const playerId =
      String(
        log.playerId || ""
      )
      .trim();


    const date =
      String(
        log.date || ""
      )
      .trim();


    const matchKey =
      matchKeyOf(log);


    if (
      !playerId
      ||
      !date
      ||
      !matchKey
    ) {

      continue;

    }


    const key =
      `${matchKey}::${playerId}`;


    let part =
      participationMap.get(
        key
      );


    if (!part) {

      part = {

        playerId,

        date,

        matchKey,

        result:
          normalizeResult(
            log
          ),

        side:
          normalizeSide(
            log
          ),

        normalGoals: 0,

        ownGoals: 0,

        createdAt:
          Number(
            log.createdAt || 0
          ),

        rawCount: 0

      };


      participationMap.set(
        key,
        part
      );

    }


    const goals =
      clampInt(
        log.goals,
        0,
        99
      );


    /*
      IMPORTANT:

      We use MAX rather than SUM
      for entries of the SAME TYPE.

      Why?

      Normal 2 goals
      +
      accidental duplicate Normal 2 goals

      should remain 2 goals,
      not become 4.

      But:

      Normal 2
      +
      Own Goal 1

      correctly becomes:

      normalGoals = 2
      ownGoals = 1
    */

    if (
      isOwnGoal(log)
    ) {

      part.ownGoals =
        Math.max(
          part.ownGoals,
          goals
        );

    } else {

      part.normalGoals =
        Math.max(
          part.normalGoals,
          goals
        );

    }


    part.rawCount += 1;


    const createdAt =
      Number(
        log.createdAt || 0
      );


    if (
      createdAt >=
      part.createdAt
    ) {

      part.createdAt =
        createdAt;


      part.result =
        normalizeResult(
          log
        );


      part.side =
        normalizeSide(
          log
        );

    }

  }


  const participations =
    Array
      .from(
        participationMap.values()
      )
      .sort(
        compareParticipationsOldestFirst
      );


  const byPlayer =
    new Map();


  const byMatch =
    new Map();


  players.forEach(
    p =>

      byPlayer.set(
        String(p.id),
        []
      )

  );


  for (
    const part
    of
    participations
  ) {

    if (
      !byPlayer.has(
        part.playerId
      )
    ) {

      byPlayer.set(
        part.playerId,
        []
      );

    }


    byPlayer
      .get(
        part.playerId
      )
      .push(
        part
      );


    if (
      !byMatch.has(
        part.matchKey
      )
    ) {

      byMatch.set(
        part.matchKey,
        []
      );

    }


    byMatch
      .get(
        part.matchKey
      )
      .push(
        part
      );

  }


  /*
    Calculate each match once.
  */

  const matchSummaries =
    new Map();


  for (
    const [
      matchKey,
      parts
    ]
    of
    byMatch.entries()
  ) {

    const teamA =
      parts.filter(
        x =>
          x.side === "A"
      );


    const teamB =
      parts.filter(
        x =>
          x.side === "B"
      );


    /*
      Team A score:

      Team A normal goals
      +
      Team B own goals
    */

    const scoreA =

      teamA.reduce(
        (
          s,
          x
        ) =>
          s +
          x.normalGoals,

        0
      )

      +

      teamB.reduce(
        (
          s,
          x
        ) =>
          s +
          x.ownGoals,

        0
      );


    /*
      Team B score:

      Team B normal goals
      +
      Team A own goals
    */

    const scoreB =

      teamB.reduce(
        (
          s,
          x
        ) =>
          s +
          x.normalGoals,

        0
      )

      +

      teamA.reduce(
        (
          s,
          x
        ) =>
          s +
          x.ownGoals,

        0
      );


    const date =
      parts
        .map(
          x =>
            x.date
        )
        .sort()
        .at(-1)
      ||
      "";


    matchSummaries.set(
      matchKey,
      {

        matchKey,

        date,

        parts,

        teamA,

        teamB,

        scoreA,

        scoreB

      }
    );

  }


  /*
    PLAYER STATS
  */

  const stats = {};

  const forms = {};


  for (
    const p
    of
    players
  ) {

    const pid =
      String(
        p.id
      );


    const arr =
      (
        byPlayer.get(pid)
        ||
        []
      )
      .slice()
      .sort(
        compareParticipationsOldestFirst
      );


    const s =
      emptyStats();


    s.matches =
      arr.length;


    let run = 0;


    for (
      const part
      of
      arr
    ) {

      /*
        OWN GOALS are excluded
        from personal goals.
      */

      s.goals +=
        part.normalGoals;


      if (
        part.result
        ===
        "win"
      ) {

        s.wins += 1;

        run += 1;


        s.best =
          Math.max(
            s.best,
            run
          );

      } else {

        if (
          part.result
          ===
          "draw"
        ) {

          s.draws += 1;

        } else {

          s.losses += 1;

        }


        /*
          Draw and loss both
          break a win streak.
        */

        run = 0;

      }

    }


    /*
      Current streak.
    */

    for (
      let i =
        arr.length - 1;

      i >= 0;

      i--
    ) {

      if (
        arr[i].result
        ===
        "win"
      ) {

        s.current += 1;

      } else {

        break;

      }

    }


    s.winPct =
      s.matches
        ?
        s.wins
        /
        s.matches
        :
        0;


    s.gpm =
      s.matches
        ?
        s.goals
        /
        s.matches
        :
        0;


    stats[pid] =
      s;


    /*
      Last FIVE ACTUAL MATCHES.

      Not last 5 Firestore entries.
    */

    const last5 =
      arr.slice(-5);


    const points =
      last5.reduce(
        (
          sum,
          part
        ) => {

          if (
            part.result
            ===
            "win"
          ) {

            return (
              sum + 1
            );

          }


          if (
            part.result
            ===
            "draw"
          ) {

            return (
              sum + 0.5
            );

          }


          return sum;

        },

        0
      );


    /*
      last5 is chronological.

      OLD → NEW

      therefore newest icon
      is always RIGHT.
    */

    forms[pid] = {

      formPoints:
        points,

      formIcons:
        last5
          .map(
            part =>
              resultIcon(
                part.result
              )
          )
          .join(" "),

      totalPlayerMatches:
        s.matches

    };

  }


  /*
    Eligibility:

    Total matches 6 -> 3
    Total matches 7 -> 3
    Total matches 8 -> 4
  */

  const totalMatches =
    byMatch.size;


  const minEligibleMatches =
    Math.max(
      1,
      Math.floor(
        totalMatches
        /
        2
      )
    );


  const eligibleIds =
    new Set(

      players

        .filter(
          p =>

            (
              stats[
                String(
                  p.id
                )
              ]
              ?.matches
              ||
              0
            )

            >=

            minEligibleMatches
        )

        .map(
          p =>
            String(
              p.id
            )
        )

    );


  return {

    participations,

    byPlayer,

    byMatch,

    matchSummaries,

    stats,

    forms,

    totalMatches,

    minEligibleMatches,

    eligibleIds

  };

}


/* =========================================================
   MAIN RENDER
========================================================= */

function renderAll() {

  /*
    One model calculation
    for the entire app.
  */

  model =
    buildDataModel();


  renderLogPlayerOptions();

  renderCompareOptions();

  renderInForm();

  renderPlayerOfMonth();

  renderDashboard();

  renderLeaderboard();

  renderTable();

  renderPlayersAdmin();

  renderLogs();

  renderMatchHistory();

  renderPlayerCardsNameOnly();

  renderCompare();


  if (
    currentProfileId
  ) {

    renderPlayerProfile(
      currentProfileId
    );

  }

}


/* =========================================================
   ENTRY PLAYER SELECT
========================================================= */

function renderLogPlayerOptions() {

  const sel =
    $("logPlayer");


  if (!sel) {

    return;

  }


  const sorted =
    players
      .slice()
      .sort(
        (
          a,
          b
        ) =>

          String(
            a.name || ""
          )
          .localeCompare(
            String(
              b.name || ""
            )
          )

      );


  const signature =
    sorted
      .map(
        p =>
          `${p.id}:${p.name}`
      )
      .join("|");


  /*
    Don't rebuild the select
    after every stats render.
  */

  if (
    signature
    ===
    logPlayerOptionsSignature
  ) {

    return;

  }


  const cur =
    sel.value;


  sel.innerHTML =
    sorted
      .map(
        p =>

          `<option value="${esc(p.id)}">${esc(p.name || "")}</option>`

      )
      .join("");


  if (
    cur
    &&
    sorted.some(
      p =>
        String(p.id)
        ===
        String(cur)
    )
  ) {

    sel.value =
      cur;

  }


  logPlayerOptionsSignature =
    signature;

}


/* =========================================================
   COMPARE OPTIONS
========================================================= */

function renderCompareOptions() {

  const a =
    $("cmpPlayerA");


  const b =
    $("cmpPlayerB");


  if (
    !a ||
    !b
  ) {

    return;

  }


  const sorted =
    players
      .slice()
      .sort(
        (
          x,
          y
        ) =>

          String(
            x.name || ""
          )
          .localeCompare(
            String(
              y.name || ""
            )
          )

      );


  const signature =
    sorted
      .map(
        p =>
          `${p.id}:${p.name}`
      )
      .join("|");


  if (
    signature
    ===
    compareOptionsSignature
  ) {

    return;

  }


  const aCur =
    a.value;


  const bCur =
    b.value;


  const options =

    `<option value="">Select player</option>`

    +

    sorted
      .map(
        p =>

          `<option value="${esc(p.id)}">${esc(p.name || "")}</option>`

      )
      .join("");


  a.innerHTML =
    options;


  b.innerHTML =
    options;


  if (
    aCur
    &&
    sorted.some(
      p =>
        String(p.id)
        ===
        String(aCur)
    )
  ) {

    a.value =
      aCur;

  }


  if (
    bCur
    &&
    sorted.some(
      p =>
        String(p.id)
        ===
        String(bCur)
    )
  ) {

    b.value =
      bCur;

  }


  if (
    a.value
    &&
    b.value
    &&
    a.value ===
    b.value
  ) {

    b.value = "";

  }


  compareOptionsSignature =
    signature;

}


/* =========================================================
   IN FORM PLAYERS
========================================================= */

function renderInForm() {

  const box =
    $("inFormList");


  if (!box) {

    return;

  }


  const rows =
    players

      .filter(
        p =>
          model
            .eligibleIds
            .has(
              String(
                p.id
              )
            )
      )

      .map(
        p => {

          const pid =
            String(
              p.id
            );


          const form =
            model.forms[pid]
            ||
            {
              formPoints: 0,
              formIcons: "",
              totalPlayerMatches: 0
            };


          const s =
            model.stats[pid]
            ||
            emptyStats();


          return {

            name:
              p.name || "",

            formPoints:
              form.formPoints,

            formIcons:
              form.formIcons,

            matches:
              s.matches,

            goals:
              s.goals,

            winPct:
              s.winPct

          };

        }
      )

      .sort(
        (
          a,
          b
        ) =>

          (
            b.formPoints
            -
            a.formPoints
          )

          ||

          (
            b.winPct
            -
            a.winPct
          )

          ||

          (
            b.goals
            -
            a.goals
          )

          ||

          a.name.localeCompare(
            b.name
          )

      )

      .slice(
        0,
        3
      );


  if (
    !rows.length
  ) {

    box.innerHTML =
      `<div class="note">No eligible players yet.</div>`;


    return;

  }


  box.innerHTML =
    rows
      .map(
        (
          r,
          i
        ) => `

          <div class="item">

            <div>

              <div class="name">
                ${medal(i)} ${esc(r.name)}
              </div>

              <div class="meta">

                Points:
                <b>${formatFormPoints(r.formPoints)}</b>

                ·

                Last 5:
                <b>${r.formIcons || "—"}</b>

                ·

                Matches:
                <b>${r.matches}</b>

              </div>

            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   PLAYER OF THE MONTH
========================================================= */

function getPlayerOfMonthBox() {

  /*
    Direct ID in the new index.
  */

  if (
    $("playerOfMonthList")
  ) {

    return $(
      "playerOfMonthList"
    );

  }


  /*
    Compatibility with older
    versions if the ID differed.
  */

  if (
    $("dashPlayerOfMonth")
  ) {

    return $(
      "dashPlayerOfMonth"
    );

  }


  if (
    $("playerOfTheMonthList")
  ) {

    return $(
      "playerOfTheMonthList"
    );

  }


  /*
    Last fallback:
    find the card by title.
  */

  const title =
    Array
      .from(
        document.querySelectorAll(
          ".card-title"
        )
      )
      .find(
        el =>

          String(
            el.textContent || ""
          )
          .trim()
          .toLowerCase()

          ===

          "player of the month"
      );


  return (

    title
      ?.closest(".card")
      ?.querySelector(
        ".list, [data-potm-list]"
      )

    ||

    null

  );

}


function renderPlayerOfMonth() {

  const box =
    getPlayerOfMonthBox();


  if (!box) {

    return;

  }


  const currentMonth =
    localISODate()
      .slice(
        0,
        7
      );


  const currentRows =
    calculateMonthScores(
      currentMonth
    )
    .slice(
      0,
      3
    );


  const pastMonths =
    Array
      .from(
        new Set(

          model
            .participations
            .map(
              p =>
                p.date.slice(
                  0,
                  7
                )
            )

        )
      )
      .filter(
        m =>

          /^\d{4}-\d{2}$/
            .test(m)

          &&

          m !== currentMonth
      )
      .sort(
        (
          a,
          b
        ) =>
          b.localeCompare(a)
      );


  if (
    !currentRows.length
  ) {

    box.innerHTML =

      `<div class="note">No monthly data yet.</div>`

      +

      renderPastMonthsToggle(
        pastMonths
      );

  } else {

    box.innerHTML =

      currentRows
        .map(
          (
            r,
            i
          ) =>
            monthPlayerItem(
              r,
              i
            )
        )
        .join("")

      +

      renderPastMonthsToggle(
        pastMonths
      );

  }


  const btn =
    box.querySelector(
      "[data-toggle-past-months]"
    );


  btn?.addEventListener(
    "click",
    () => {

      showPastMonths =
        !showPastMonths;


      renderPlayerOfMonth();

    }
  );

}


function renderPastMonthsToggle(
  months
) {

  if (
    !months.length
  ) {

    return "";

  }


  const details =
    showPastMonths
      ?
      `

        <div style="margin-top:12px">

          ${

            months
              .map(
                month => {

                  const rows =
                    calculateMonthScores(
                      month
                    )
                    .slice(
                      0,
                      3
                    );


                  if (
                    !rows.length
                  ) {

                    return "";

                  }


                  return `

                    <div class="item">

                      <div style="width:100%">

                        <div class="name">
                          ${esc(formatMonthLabel(month))}
                        </div>

                        <div style="margin-top:8px">

                          ${

                            rows
                              .map(
                                (
                                  r,
                                  i
                                ) => `

                                  <div class="meta" style="margin:5px 0">

                                    ${medal(i)}

                                    <b>${esc(r.name)}</b>

                                    ·

                                    ${fmt1(r.score)}/10

                                    ·

                                    ${r.matches} matches

                                    ·

                                    ${r.goals} goals

                                  </div>

                                `
                              )
                              .join("")

                          }

                        </div>

                      </div>

                    </div>

                  `;

                }
              )
              .join("")

          }

        </div>

      `
      :
      "";


  return `

    <div style="margin-top:12px">

      <button
        type="button"
        class="btn ghost"
        data-toggle-past-months
      >

        ${
          showPastMonths
            ? "Hide past months"
            : "Show past months"
        }

      </button>

    </div>

    ${details}

  `;

}


/* =========================================================
   MONTHLY SCORE
========================================================= */

function calculateMonthScores(
  monthKey
) {

  /*
    This preserves the previous
    Player of The Month formula:

    +0.5 attendance
    +0.1 per goal

    win  +1
    draw +0.5
    loss -0.5

    team scores >= 5  +0.2
    team scores >= 10 +0.5

    conceded < 5  +0.5
    conceded <= 3 +0.8

    capped at 10
  */

  const monthParts =
    model
      .participations
      .filter(
        p =>
          p.date.startsWith(
            monthKey
          )
      );


  const rows =
    new Map();


  for (
    const part
    of
    monthParts
  ) {

    /*
      Dashboard eligibility
      rule applies here too.
    */

    if (
      !model
        .eligibleIds
        .has(
          part.playerId
        )
    ) {

      continue;

    }


    if (
      !rows.has(
        part.playerId
      )
    ) {

      rows.set(
        part.playerId,
        {

          playerId:
            part.playerId,

          name:
            playerName(
              part.playerId
            ),

          matches: 0,

          wins: 0,

          draws: 0,

          losses: 0,

          goals: 0,

          rawScore: 0,

          score: 0

        }
      );

    }


    const row =
      rows.get(
        part.playerId
      );


    const match =
      model
        .matchSummaries
        .get(
          part.matchKey
        );


    /*
      Attendance counted ONCE
      regardless of how many
      Firestore entries exist.
    */

    row.matches += 1;

    row.goals +=
      part.normalGoals;


    row.rawScore +=
      0.5;


    row.rawScore +=
      part.normalGoals
      *
      0.1;


    if (
      part.result === "win"
    ) {

      row.wins += 1;

      row.rawScore +=
        1;

    } else if (
      part.result === "draw"
    ) {

      row.draws += 1;

      row.rawScore +=
        0.5;

    } else {

      row.losses += 1;

      row.rawScore -=
        0.5;

    }


    if (match) {

      const teamGoals =
        part.side === "A"
          ?
          match.scoreA
          :
          match.scoreB;


      const conceded =
        part.side === "A"
          ?
          match.scoreB
          :
          match.scoreA;


      if (
        teamGoals >= 10
      ) {

        row.rawScore +=
          0.5;

      } else if (
        teamGoals >= 5
      ) {

        row.rawScore +=
          0.2;

      }


      if (
        conceded <= 3
      ) {

        row.rawScore +=
          0.8;

      } else if (
        conceded < 5
      ) {

        row.rawScore +=
          0.5;

      }

    }

  }


  return (
    Array
      .from(
        rows.values()
      )

      .map(
        row => ({

          ...row,

          score:
            Math.min(
              10,
              round1(
                row.rawScore
              )
            )

        })
      )

      .sort(
        (
          a,
          b
        ) =>

          (
            b.score
            -
            a.score
          )

          ||

          (
            b.matches
            -
            a.matches
          )

          ||

          (
            b.wins
            -
            a.wins
          )

          ||

          (
            b.goals
            -
            a.goals
          )

          ||

          a.name.localeCompare(
            b.name
          )

      )

  );

}


function monthPlayerItem(
  r,
  i
) {

  return `

    <div class="item">

      <div>

        <div class="name">
          ${medal(i)} ${esc(r.name)}
        </div>

        <div class="meta">

          Score
          <b>${fmt1(r.score)}/10</b>

          ·

          Matches
          <b>${r.matches}</b>

          ·

          W
          <b>${r.wins}</b>

          ·

          D
          <b>${r.draws}</b>

          ·

          L
          <b>${r.losses}</b>

          ·

          Goals
          <b>${r.goals}</b>

        </div>

      </div>

    </div>

  `;

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  const rows =
    players

      .filter(
        p =>
          model
            .eligibleIds
            .has(
              String(
                p.id
              )
            )
      )

      .map(
        p => ({

          p,

          s:
            model.stats[
              String(
                p.id
              )
            ]
            ||
            emptyStats()

        })
      );


  /*
    TOP SCORERS
  */

  const topGoals =
    rows
      .slice()
      .sort(
        (
          a,
          b
        ) =>

          (
            b.s.goals
            -
            a.s.goals
          )

          ||

          (
            b.s.gpm
            -
            a.s.gpm
          )

          ||

          String(
            a.p.name || ""
          )
          .localeCompare(
            String(
              b.p.name || ""
            )
          )

      )
      .slice(
        0,
        3
      );


  if (
    $("dashTopScorers")
  ) {

    $("dashTopScorers").innerHTML =
      topGoals.length
        ?
        topGoals
          .map(
            (
              x,
              i
            ) =>

              dashItem(

                `${medal(i)} ${esc(x.p.name)}`,

                `${x.s.goals} goals · G/Match ${fmt2(x.s.gpm)} · Win% ${fmtPct(x.s.winPct)}`

              )

          )
          .join("")

        :

        `<div class="note">No eligible players yet.</div>`;

  }


  /*
    CURRENT STREAK
  */

  const topStreak =
    rows
      .slice()
      .sort(
        (
          a,
          b
        ) =>

          (
            b.s.current
            -
            a.s.current
          )

          ||

          (
            b.s.best
            -
            a.s.best
          )

          ||

          String(
            a.p.name || ""
          )
          .localeCompare(
            String(
              b.p.name || ""
            )
          )

      )
      .slice(
        0,
        3
      );


  if (
    $("dashTopStreaks")
  ) {

    $("dashTopStreaks").innerHTML =
      topStreak.length
        ?
        topStreak
          .map(
            (
              x,
              i
            ) =>

              dashItem(

                `${medal(i)} ${esc(x.p.name)}`,

                `Current: ${x.s.current} · Best: ${x.s.best} · Matches: ${x.s.matches}`

              )

          )
          .join("")

        :

        `<div class="note">No eligible players yet.</div>`;

  }


  /*
    WIN %
  */

  const topWin =
    rows
      .slice()
      .sort(
        (
          a,
          b
        ) =>

          (
            b.s.winPct
            -
            a.s.winPct
          )

          ||

          (
            b.s.wins
            -
            a.s.wins
          )

          ||

          (
            b.s.goals
            -
            a.s.goals
          )

          ||

          String(
            a.p.name || ""
          )
          .localeCompare(
            String(
              b.p.name || ""
            )
          )

      )
      .slice(
        0,
        3
      );


  if (
    $("dashTopWinPct")
  ) {

    $("dashTopWinPct").innerHTML =
      topWin.length
        ?
        topWin
          .map(
            (
              x,
              i
            ) =>

              dashItem(

                `${medal(i)} ${esc(x.p.name)}`,

                `Win% ${fmtPct(x.s.winPct)} · Wins ${x.s.wins}/${x.s.matches} · Goals ${x.s.goals}`

              )

          )
          .join("")

        :

        `<div class="note">No eligible players yet.</div>`;

  }

}


/* =========================================================
   LEADERBOARD
========================================================= */

function renderLeaderboard() {

  const sortBy =
    $("lbSort")?.value
    ||
    "form";


  const rows =
    players

      .filter(
        p =>
          model
            .eligibleIds
            .has(
              String(
                p.id
              )
            )
      )

      .map(
        p => {

          const pid =
            String(
              p.id
            );


          const s =
            model.stats[pid]
            ||
            emptyStats();


          const form =
            model.forms[pid]
            ||
            {
              formPoints: 0,
              formIcons: ""
            };


          return {

            id:
              pid,

            name:
              p.name || "",

            matches:
              s.matches,

            wins:
              s.wins,

            goals:
              s.goals,

            winPct:
              s.winPct,

            gpm:
              s.gpm,

            curStreak:
              s.current,

            bestStreak:
              s.best,

            formPoints:
              form.formPoints,

            formIcons:
              form.formIcons

          };

        }
      )

      .sort(
        sorter(
          sortBy
        )
      );


  const box =
    $("leaderboardList");


  if (!box) {

    return;

  }


  box.innerHTML =
    rows.length
      ?
      rows
        .map(
          (
            r,
            i
          ) => `

            <div class="item">

              <div>

                <div class="name">
                  ${medal(i)} ${esc(r.name)}
                </div>

                <div class="meta">

                  Form
                  <b>${formatFormPoints(r.formPoints)}</b>

                  ·

                  Last 5
                  <b>${r.formIcons || "—"}</b>

                  ·

                  Matches
                  <b>${r.matches}</b>

                  ·

                  Wins
                  <b>${r.wins}</b>

                  ·

                  Goals
                  <b>${r.goals}</b>

                  ·

                  Win%
                  <b>${fmtPct(r.winPct)}</b>

                  ·

                  G/Match
                  <b>${fmt2(r.gpm)}</b>

                  ·

                  Streak
                  <b>${r.curStreak}</b>

                  (best ${r.bestStreak})

                </div>

              </div>

            </div>

          `
        )
        .join("")

      :

      `<div class="note">No eligible players yet.</div>`;

}


/* =========================================================
   TABLE
========================================================= */

function renderTable() {

  const sortBy =
    $("tableSort")?.value
    ||
    "winPct";


  const rows =
    players

      .filter(
        p =>
          model
            .eligibleIds
            .has(
              String(
                p.id
              )
            )
      )

      .map(
        p => {

          const s =
            model.stats[
              String(
                p.id
              )
            ]
            ||
            emptyStats();


          return {

            name:
              p.name || "",

            matches:
              s.matches,

            wins:
              s.wins,

            goals:
              s.goals,

            winPct:
              s.winPct,

            gpm:
              s.gpm,

            curStreak:
              s.current,

            bestStreak:
              s.best

          };

        }
      )

      .sort(
        sorter(
          sortBy
        )
      );


  const body =
    $("tableBody");


  if (!body) {

    return;

  }


  body.innerHTML =
    rows.length
      ?
      rows
        .map(
          (
            r,
            idx
          ) => `

            <tr>

              <td>${idx + 1}</td>

              <td>${esc(r.name)}</td>

              <td>${r.matches}</td>

              <td>${r.wins}</td>

              <td>${r.goals}</td>

              <td>${fmtPct(r.winPct)}</td>

              <td>${fmt2(r.gpm)}</td>

              <td>${r.curStreak}</td>

              <td>${r.bestStreak}</td>

            </tr>

          `
        )
        .join("")

      :

      `<tr><td colspan="9" class="noteCell">No eligible players yet.</td></tr>`;

}


/* =========================================================
   PLAYER CARDS
========================================================= */

function renderPlayerCardsNameOnly() {

  const box =
    $("playerCards");


  if (!box) {

    return;

  }


  if (
    !players.length
  ) {

    box.classList.add(
      "note"
    );


    box.textContent =
      "No players yet.";


    return;

  }


  box.classList.remove(
    "note"
  );


  const sorted =
    players
      .slice()
      .sort(
        (
          a,
          b
        ) =>

          String(
            a.name || ""
          )
          .localeCompare(
            String(
              b.name || ""
            )
          )

      );


  box.innerHTML =
    sorted
      .map(
        p => `

          <div
            class="pCard pCardNameOnly"
            data-player-id="${esc(p.id)}"
          >

            <div class="pName">
              ${esc(p.name || "")}
            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   PROFILE
========================================================= */

function openProfile(
  pid
) {

  currentProfileId =
    String(pid);


  showScreen(
    "playerprofile"
  );


  setActiveNav(
    "playerstats"
  );


  renderPlayerProfile(
    currentProfileId
  );

}


function renderPlayerProfile(
  pid
) {

  const p =
    players.find(
      x =>
        String(x.id)
        ===
        String(pid)
    );


  if (!p) {

    return;

  }


  const s =
    model.stats[
      String(pid)
    ]
    ||
    emptyStats();


  if (
    $("profileName")
  ) {

    $("profileName").textContent =
      p.name || "Player";

  }


  if (
    $("profileSub")
  ) {

    $("profileSub").textContent =
      "";

  }


  const grid =
    $("profileStatsGrid");


  if (grid) {

    grid.innerHTML =
      [

        tile(
          "Matches",
          s.matches
        ),

        tile(
          "Goals",
          s.goals
        ),

        tile(
          "Wins",
          s.wins
        ),

        tile(
          "Win %",
          fmtPct(
            s.winPct
          )
        ),

        tile(
          "Goals per Match",
          fmt2(
            s.gpm
          )
        ),

        tile(
          "Current Win Streak",
          s.current
        ),

        tile(
          "Best Win Streak",
          s.best
        )

      ]
      .join("");

  }


  const form =
    model.forms[
      String(pid)
    ]
    ||
    {
      formIcons: ""
    };


  if (
    $("profileForm")
  ) {

    $("profileForm").textContent =
      form.formIcons
      ||
      "No matches yet";

  }


  renderTeammates(
    pid
  );

}


/* =========================================================
   TEAMMATES
========================================================= */

function renderTeammates(
  pid
) {

  const counts =
    computeTeammates(
      String(pid)
    );


  const matesBox =
    $("profileMates");


  const neverBox =
    $("profileNever");


  const sorted =
    Object
      .entries(
        counts
      )
      .sort(
        (
          a,
          b
        ) =>

          (
            b[1]
            -
            a[1]
          )

          ||

          playerName(
            a[0]
          )
          .localeCompare(
            playerName(
              b[0]
            )
          )

      );


  const playedIds =
    new Set(

      sorted.map(
        (
          [id]
        ) =>
          id
      )

    );


  const never =
    players

      .filter(
        x =>

          String(
            x.id
          )
          !==
          String(
            pid
          )

          &&

          !playedIds.has(
            String(
              x.id
            )
          )
      )

      .map(
        x =>
          x.name
          ||
          "Unknown"
      )

      .sort(
        (
          a,
          b
        ) =>
          a.localeCompare(b)
      );


  if (
    matesBox
  ) {

    if (
      !sorted.length
    ) {

      matesBox.classList.add(
        "note"
      );


      matesBox.textContent =
        "No teammate data yet.";

    } else {

      matesBox.classList.remove(
        "note"
      );


      matesBox.innerHTML =
        sorted
          .map(
            (
              [
                id,
                c
              ]
            ) => `

              <div class="mateRow">

                <div class="playerName">
                  ${esc(playerName(id))}
                </div>

                <div class="playerGoals">
                  ${c}
                </div>

              </div>

            `
          )
          .join("");

    }

  }


  if (
    neverBox
  ) {

    if (
      !never.length
    ) {

      neverBox.classList.add(
        "note"
      );


      neverBox.textContent =
        "—";

    } else {

      neverBox.classList.remove(
        "note"
      );


      neverBox.textContent =
        never.join(
          " - "
        );

    }

  }

}


function computeTeammates(
  pid
) {

  const counts = {};


  for (
    const summary
    of
    model
      .matchSummaries
      .values()
  ) {

    const playerEntry =
      summary
        .parts
        .find(
          x =>
            x.playerId
            ===
            pid
        );


    if (
      !playerEntry
    ) {

      continue;

    }


    summary
      .parts

      .filter(
        x =>

          x.side
          ===
          playerEntry.side

          &&

          x.playerId
          !==
          pid
      )

      .forEach(
        x => {

          counts[
            x.playerId
          ] =
            (
              counts[
                x.playerId
              ]
              ||
              0
            )
            +
            1;

        }
      );

  }


  return counts;

}


/* =========================================================
   MATCH HISTORY
========================================================= */

function renderMatchHistory() {

  const box =
    $("matchHistoryList");


  if (!box) {

    return;

  }


  const matches =
    Array
      .from(
        model
          .matchSummaries
          .values()
      )
      .sort(
        (
          a,
          b
        ) =>

          String(
            b.date
          )
          .localeCompare(
            String(
              a.date
            )
          )

          ||

          Math.max(
            ...b.parts.map(
              x =>
                x.createdAt || 0
            ),
            0
          )

          -

          Math.max(
            ...a.parts.map(
              x =>
                x.createdAt || 0
            ),
            0
          )

      );


  if (
    !matches.length
  ) {

    box.innerHTML =
      `<div class="note">No matches yet.</div>`;


    return;

  }


  box.innerHTML =
    matches
      .map(
        match => {

          const titleA =
            match.scoreA
            >
            match.scoreB
              ?
              "Winners"
              :
              match.scoreA
              <
              match.scoreB
                ?
                "Losers"
                :
                "Draw";


          const titleB =
            match.scoreB
            >
            match.scoreA
              ?
              "Winners"
              :
              match.scoreB
              <
              match.scoreA
                ?
                "Losers"
                :
                "Draw";


          return `

            <div class="item">

              <div class="matchCard">

                <div class="matchTop">

                  <div class="matchDate">
                    ${esc(match.date)}
                  </div>

                  <div class="matchScore">
                    ${match.scoreA} : ${match.scoreB}
                  </div>

                </div>


                <div class="matchGrid">

                  <div class="teamBox">

                    <div class="teamTitle">
                      ${titleA}
                    </div>

                    ${sideLines(match.teamA)}

                  </div>


                  <div class="teamBox">

                    <div class="teamTitle">
                      ${titleB}
                    </div>

                    ${sideLines(match.teamB)}

                  </div>

                </div>

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   MATCH HISTORY PLAYERS
========================================================= */

function sideLines(
  entries
) {

  if (
    !entries.length
  ) {

    return (
      `<div class="meta">—</div>`
    );

  }


  const sorted =
    entries
      .slice()
      .sort(
        (
          a,
          b
        ) => {

          const aScored =
            a.normalGoals > 0
              ?
              1
              :
              0;


          const bScored =
            b.normalGoals > 0
              ?
              1
              :
              0;


          if (
            bScored !==
            aScored
          ) {

            return (
              bScored -
              aScored
            );

          }


          if (
            b.normalGoals
            !==
            a.normalGoals
          ) {

            return (
              b.normalGoals
              -
              a.normalGoals
            );

          }


          if (
            b.ownGoals
            !==
            a.ownGoals
          ) {

            return (
              b.ownGoals
              -
              a.ownGoals
            );

          }


          return (
            playerName(
              a.playerId
            )
            .localeCompare(
              playerName(
                b.playerId
              )
            )
          );

        }
      );


  return (
    sorted
      .map(
        x => {

          let name =
            playerName(
              x.playerId
            );


          /*
            Player appears ONCE.

            Example:

            Ali scores 2 normal goals
            and 1 own goal:

            Ali (own goal)   (2)
          */

          if (
            x.ownGoals > 0
          ) {

            name +=
              x.ownGoals === 1
                ?
                " (own goal)"
                :
                ` (own goals x${x.ownGoals})`;

          }


          const goals =
            x.normalGoals > 0
              ?
              `(${x.normalGoals})`
              :
              "";


          return `

            <div class="teamLine">

              <div class="playerName">
                ${esc(name)}
              </div>

              <div class="playerGoals">
                ${goals}
              </div>

            </div>

          `;

        }
      )
      .join("")
  );

}


/* =========================================================
   ADMIN PLAYER LIST
========================================================= */

function renderPlayersAdmin() {

  const box =
    $("playersList");


  if (!box) {

    return;

  }


  const html =
    players

      .slice()

      .sort(
        (
          a,
          b
        ) =>

          String(
            a.name || ""
          )
          .localeCompare(
            String(
              b.name || ""
            )
          )

      )

      .map(
        p => {

          const s =
            model.stats[
              String(
                p.id
              )
            ]
            ||
            emptyStats();


          return `

            <div class="item">

              <div>

                <div class="name">
                  ${esc(p.name || "")}
                </div>

                <div class="meta">

                  Matches
                  <b>${s.matches}</b>

                  ·

                  Wins
                  <b>${s.wins}</b>

                  ·

                  Goals
                  <b>${s.goals}</b>

                  ·

                  Win%
                  <b>${fmtPct(s.winPct)}</b>

                  ·

                  G/Match
                  <b>${fmt2(s.gpm)}</b>

                  ·

                  Streak
                  <b>${s.current}</b>

                  (best ${s.best})

                </div>

              </div>

            </div>

          `;

        }
      )
      .join("");


  box.innerHTML =
    html
    ||
    `<div class="note">No players yet.</div>`;

}


/* =========================================================
   RAW ADMIN ENTRIES
========================================================= */

function renderLogs() {

  const box =
    $("logsList");


  if (!box) {

    return;

  }


  /*
    Admin list stays RAW.

    This is useful because you can still
    see both Normal and Own Goal docs.

    But statistics use aggregated data.
  */

  const duplicateTypeCounts =
    new Map();


  for (
    const l
    of
    rawLogs
  ) {

    const key =
      `${matchKeyOf(l)}::${String(l.playerId || "")}::${isOwnGoal(l) ? "own" : "normal"}`;


    duplicateTypeCounts.set(
      key,

      (
        duplicateTypeCounts.get(
          key
        )
        ||
        0
      )
      +
      1
    );

  }


  box.innerHTML =
    rawLogs
      .slice(
        0,
        30
      )
      .map(
        l => {

          const result =
            normalizeResult(l);


          const side =
            normalizeSide(l);


          const own =
            isOwnGoal(l);


          const key =
            `${matchKeyOf(l)}::${String(l.playerId || "")}::${own ? "own" : "normal"}`;


          const duplicate =
            (
              duplicateTypeCounts.get(
                key
              )
              ||
              0
            )
            >
            1;


          return `

            <div class="item">

              <div>

                <div class="name">

                  ${esc(playerName(l.playerId))}

                  —

                  ${result.toUpperCase()}

                  ${own ? " · OWN GOAL" : ""}

                  ${duplicate ? " · DUPLICATE" : ""}

                </div>


                <div class="meta">

                  ${esc(l.date || "")}

                  ·

                  Team ${side}

                  ·

                  Goals:
                  <b>${Number(l.goals || 0)}</b>

                </div>

              </div>

            </div>

          `;

        }
      )
      .join("")

    ||

    `<div class="note">No entries yet.</div>`;

}


/* =========================================================
   COMPARE
========================================================= */

function renderCompare() {

  const aId =
    String(
      $("cmpPlayerA")?.value
      ||
      ""
    );


  const bId =
    String(
      $("cmpPlayerB")?.value
      ||
      ""
    );


  const box =
    $("compareResult");


  if (!box) {

    return;

  }


  if (
    !aId
    ||
    !bId
    ||
    aId === bId
  ) {

    box.innerHTML =
      `<div class="card"><div class="note">Select two different players.</div></div>`;


    return;

  }


  const aPlayer =
    players.find(
      p =>
        String(p.id)
        ===
        aId
    );


  const bPlayer =
    players.find(
      p =>
        String(p.id)
        ===
        bId
    );


  if (
    !aPlayer
    ||
    !bPlayer
  ) {

    box.innerHTML =
      `<div class="card"><div class="note">Players not found.</div></div>`;


    return;

  }


  const aStats =
    model.stats[aId]
    ||
    emptyStats();


  const bStats =
    model.stats[bId]
    ||
    emptyStats();


  const aForm =
    model.forms[aId]
    ||
    {
      formIcons: "",
      formPoints: 0
    };


  const bForm =
    model.forms[bId]
    ||
    {
      formIcons: "",
      formPoints: 0
    };


  const h2h =
    computeHeadToHead(
      aId,
      bId
    );


  box.innerHTML = `

    <div class="card">

      <div class="compareHeader horizontal">

        <div class="compareName">
          ${esc(aPlayer.name)}
        </div>

        <div class="compareVs">
          vs
        </div>

        <div class="compareName">
          ${esc(bPlayer.name)}
        </div>

      </div>

    </div>


    <div class="card">

      <div class="card-title">
        Head-to-Head
      </div>

      <div class="compareRows">

        ${
          compareCenterValueRow(
            "Matches against each other",
            h2h.againstMatches
          )
        }

        ${
          compareCompactDualRow(
            "Wins",
            h2h.aWinsAgainst,
            h2h.bWinsAgainst
          )
        }

        ${
          compareCenterValueRow(
            "Draws",
            h2h.drawsAgainst
          )
        }

      </div>

    </div>


    <div class="card">

      <div class="card-title">
        Teammates Record
      </div>

      <div class="compareRows">

        ${
          compareCenterValueRow(
            "Matches",
            h2h.togetherMatches
          )
        }

        ${
          compareCenterValueRow(
            "Wins",
            h2h.togetherWins
          )
        }

        ${
          compareCenterValueRow(
            "Losses",
            h2h.togetherLosses
          )
        }

        ${
          compareCenterValueRow(
            "Draws",
            h2h.togetherDraws
          )
        }

      </div>

    </div>


    <div class="card">

      <div class="card-title">
        Individual Stats
      </div>

      <div class="compareTable">

        ${
          compareStatLine(
            "Matches",
            aStats.matches,
            bStats.matches,
            aStats.matches,
            bStats.matches
          )
        }

        ${
          compareStatLine(
            "Goals",
            aStats.goals,
            bStats.goals,
            aStats.goals,
            bStats.goals
          )
        }

        ${
          compareStatLine(
            "Wins",
            aStats.wins,
            bStats.wins,
            aStats.wins,
            bStats.wins
          )
        }

        ${
          compareStatLine(
            "Win %",
            fmtPct(aStats.winPct),
            fmtPct(bStats.winPct),
            aStats.winPct,
            bStats.winPct
          )
        }

        ${
          compareStatLine(
            "Goals / Match",
            fmt2(aStats.gpm),
            fmt2(bStats.gpm),
            aStats.gpm,
            bStats.gpm
          )
        }

        ${
          compareStatLine(
            "Best Win Streak",
            aStats.best,
            bStats.best,
            aStats.best,
            bStats.best
          )
        }

        ${
          compareFormStatLine(
            "Form",
            aForm.formIcons || "—",
            bForm.formIcons || "—",
            aForm.formPoints,
            bForm.formPoints
          )
        }

      </div>

    </div>

  `;

}


/* =========================================================
   HEAD TO HEAD
========================================================= */

function computeHeadToHead(
  aId,
  bId
) {

  let againstMatches = 0;

  let aWinsAgainst = 0;

  let bWinsAgainst = 0;

  let drawsAgainst = 0;


  let togetherMatches = 0;

  let togetherWins = 0;

  let togetherLosses = 0;

  let togetherDraws = 0;


  /*
    Iterate MATCHES,
    not raw entries.
  */

  for (
    const summary
    of
    model
      .matchSummaries
      .values()
  ) {

    const aEntry =
      summary
        .parts
        .find(
          x =>
            x.playerId
            ===
            aId
        );


    const bEntry =
      summary
        .parts
        .find(
          x =>
            x.playerId
            ===
            bId
        );


    if (
      !aEntry
      ||
      !bEntry
    ) {

      continue;

    }


    if (
      aEntry.side
      !==
      bEntry.side
    ) {

      againstMatches +=
        1;


      if (
        aEntry.result === "win"
        &&
        bEntry.result === "loss"
      ) {

        aWinsAgainst +=
          1;

      } else if (
        bEntry.result === "win"
        &&
        aEntry.result === "loss"
      ) {

        bWinsAgainst +=
          1;

      } else {

        drawsAgainst +=
          1;

      }

    } else {

      togetherMatches +=
        1;


      if (
        aEntry.result === "win"
        &&
        bEntry.result === "win"
      ) {

        togetherWins +=
          1;

      } else if (
        aEntry.result === "draw"
        &&
        bEntry.result === "draw"
      ) {

        togetherDraws +=
          1;

      } else {

        togetherLosses +=
          1;

      }

    }

  }


  return {

    againstMatches,

    aWinsAgainst,

    bWinsAgainst,

    drawsAgainst,

    togetherMatches,

    togetherWins,

    togetherLosses,

    togetherDraws

  };

}


/* =========================================================
   COMPARE UI
========================================================= */

function compareCenterValueRow(
  label,
  value
) {

  return `

    <div class="compareRow compareRowCenterOnly">

      <div class="compareSingleWrap">

        <span class="compareSingleLabel">
          ${esc(label)}
        </span>

        <span class="compareSingleVal">
          ${esc(value)}
        </span>

      </div>

    </div>

  `;

}


function compareCompactDualRow(
  label,
  leftVal,
  rightVal
) {

  return `

    <div class="compareRow compareRowCompactDual">

      <div class="compareCompactSide">
        ${esc(leftVal)}
      </div>

      <div class="compareCompactLabel">
        ${esc(label)}
      </div>

      <div class="compareCompactSide">
        ${esc(rightVal)}
      </div>

    </div>

  `;

}


function compareStatLine(
  label,
  aDisplay,
  bDisplay,
  aRaw = null,
  bRaw = null
) {

  const leftBetter =
    aRaw !== null
    &&
    bRaw !== null
    &&
    Number(aRaw)
    >
    Number(bRaw);


  const rightBetter =
    aRaw !== null
    &&
    bRaw !== null
    &&
    Number(bRaw)
    >
    Number(aRaw);


  return `

    <div class="compareStatLine">

      <div class="compareSide ${leftBetter ? "better" : ""}">
        ${esc(aDisplay)}
      </div>

      <div class="compareCenter">
        ${esc(label)}
      </div>

      <div class="compareSide ${rightBetter ? "better" : ""}">
        ${esc(bDisplay)}
      </div>

    </div>

  `;

}


function compareFormStatLine(
  label,
  aDisplay,
  bDisplay,
  aRaw = null,
  bRaw = null
) {

  const leftBetter =
    aRaw !== null
    &&
    bRaw !== null
    &&
    Number(aRaw)
    >
    Number(bRaw);


  const rightBetter =
    aRaw !== null
    &&
    bRaw !== null
    &&
    Number(bRaw)
    >
    Number(aRaw);


  return `

    <div class="compareStatLine compareStatLineForm">

      <div class="compareSide compareFormSide ${leftBetter ? "better" : ""}">
        ${esc(aDisplay)}
      </div>

      <div class="compareCenter">
        ${esc(label)}
      </div>

      <div class="compareSide compareFormSide ${rightBetter ? "better" : ""}">
        ${esc(bDisplay)}
      </div>

    </div>

  `;

}


/* =========================================================
   HELPERS
========================================================= */

function tile(
  label,
  value
) {

  return `

    <div class="statTile">

      <div class="stLabel">
        ${esc(label)}
      </div>

      <div class="stValue">
        ${esc(value)}
      </div>

    </div>

  `;

}


/* =========================================================
   SORT
========================================================= */

function sorter(
  k
) {

  if (
    k === "name"
  ) {

    return (
      (
        a,
        b
      ) =>
        a.name.localeCompare(
          b.name
        )
    );

  }


  if (
    k === "form"
  ) {

    return (
      (
        a,
        b
      ) =>

        (
          Number(
            b.formPoints || 0
          )
          -
          Number(
            a.formPoints || 0
          )
        )

        ||

        (
          Number(
            b.winPct || 0
          )
          -
          Number(
            a.winPct || 0
          )
        )

        ||

        (
          Number(
            b.goals || 0
          )
          -
          Number(
            a.goals || 0
          )
        )

        ||

        a.name.localeCompare(
          b.name
        )
    );

  }


  const key =
    (
      {
        winPct:
          "winPct",

        goals:
          "goals",

        gpm:
          "gpm",

        wins:
          "wins",

        matches:
          "matches",

        curStreak:
          "curStreak",

        bestStreak:
          "bestStreak"
      }[k]
    )
    ||
    "winPct";


  return (
    (
      a,
      b
    ) =>

      (
        Number(
          b[key] || 0
        )
        -
        Number(
          a[key] || 0
        )
      )

      ||

      (
        Number(
          b.goals || 0
        )
        -
        Number(
          a.goals || 0
        )
      )

      ||

      a.name.localeCompare(
        b.name
      )
  );

}


/* =========================================================
   DATE / ENTRY SORT
========================================================= */

function compareRawLogsNewestFirst(
  a,
  b
) {

  const da =
    String(
      a.date || ""
    );


  const db =
    String(
      b.date || ""
    );


  if (
    da !== db
  ) {

    return (
      db.localeCompare(
        da
      )
    );

  }


  return (

    Number(
      b.createdAt || 0
    )

    -

    Number(
      a.createdAt || 0
    )

  );

}


function compareRawLogsOldestFirst(
  a,
  b
) {

  const da =
    String(
      a.date || ""
    );


  const db =
    String(
      b.date || ""
    );


  if (
    da !== db
  ) {

    return (
      da.localeCompare(
        db
      )
    );

  }


  return (

    Number(
      a.createdAt || 0
    )

    -

    Number(
      b.createdAt || 0
    )

  );

}


function compareParticipationsOldestFirst(
  a,
  b
) {

  if (
    a.date !==
    b.date
  ) {

    return (
      a.date.localeCompare(
        b.date
      )
    );

  }


  if (
    a.matchKey !==
    b.matchKey
  ) {

    return (
      a.matchKey.localeCompare(
        b.matchKey
      )
    );

  }


  return (

    Number(
      a.createdAt || 0
    )

    -

    Number(
      b.createdAt || 0
    )

  );

}


/* =========================================================
   RESULT ICON
========================================================= */

function resultIcon(
  result
) {

  if (
    result === "win"
  ) {

    return "🟢";

  }


  if (
    result === "draw"
  ) {

    return "🟡";

  }


  return "🔴";

}


/* =========================================================
   PLAYER NAME
========================================================= */

function playerName(
  id
) {

  return (

    players.find(
      p =>
        String(p.id)
        ===
        String(id)
    )
    ?.name

    ||

    "Unknown"

  );

}


/* =========================================================
   LOCAL DATE
========================================================= */

function localISODate() {

  const d =
    new Date();


  const y =
    d.getFullYear();


  const m =
    String(
      d.getMonth()
      +
      1
    )
    .padStart(
      2,
      "0"
    );


  const day =
    String(
      d.getDate()
    )
    .padStart(
      2,
      "0"
    );


  return (
    `${y}-${m}-${day}`
  );

}


/* =========================================================
   MONTH LABEL
========================================================= */

function formatMonthLabel(
  monthKey
) {

  const [
    y,
    m
  ] =
    monthKey
      .split("-")
      .map(Number);


  if (
    !y ||
    !m
  ) {

    return monthKey;

  }


  return (

    new Intl.DateTimeFormat(
      "en",
      {
        month:
          "long",

        year:
          "numeric"
      }
    )
    .format(
      new Date(
        y,
        m - 1,
        1
      )
    )

  );

}


/* =========================================================
   FORMAT
========================================================= */

function formatFormPoints(
  n
) {

  return (
    Number.isInteger(n)
      ?
      String(n)
      :
      Number(
        n || 0
      )
      .toFixed(1)
  );

}


function clampInt(
  v,
  min,
  max
) {

  const n =
    Math.floor(
      Number(v)
    );


  if (
    !Number.isFinite(n)
  ) {

    return min;

  }


  return (
    Math.max(
      min,
      Math.min(
        max,
        n
      )
    )
  );

}


function round1(
  n
) {

  return (

    Math.round(
      (
        Number(n)
        +
        Number.EPSILON
      )
      *
      10
    )

    /

    10

  );

}


function fmtPct(
  x
) {

  return (

    `${

      Math.round(

        (
          Number(x)
          ||
          0
        )

        *

        100

      )

    }%`

  );

}


function fmt2(
  x
) {

  return (
    (
      Number(x)
      ||
      0
    )
    .toFixed(2)
  );

}


function fmt1(
  x
) {

  return (
    (
      Number(x)
      ||
      0
    )
    .toFixed(1)
  );

}


function medal(
  i
) {

  return (
    i === 0
      ?
      "🥇"
      :
      i === 1
        ?
        "🥈"
        :
        i === 2
          ?
          "🥉"
          :
          ""
  );

}


function dashItem(
  t,
  m
) {

  return `

    <div class="item">

      <div>

        <div class="name">
          ${t}
        </div>

        <div class="meta">
          ${m}
        </div>

      </div>

    </div>

  `;

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function esc(
  s
) {

  return (
    String(s)

      .replaceAll(
        "&",
        "&amp;"
      )

      .replaceAll(
        "<",
        "&lt;"
      )

      .replaceAll(
        ">",
        "&gt;"
      )

      .replaceAll(
        '"',
        "&quot;"
      )

      .replaceAll(
        "'",
        "&#039;"
      )
  );

}


/* =========================================================
   EXPORT
========================================================= */

function exportJSON() {

  /*
    Export RAW Firebase data,
    not aggregated data.

    This preserves the true backup.
  */

  const data = {

    exportedAt:
      new Date()
        .toISOString(),

    players,

    logs:
      rawLogs

  };


  const blob =
    new Blob(
      [
        JSON.stringify(
          data,
          null,
          2
        )
      ],
      {
        type:
          "application/json"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;


  a.download =
    `ftbll_backup_${localISODate()}.json`;


  document.body.appendChild(
    a
  );


  a.click();


  a.remove();


  URL.revokeObjectURL(
    url
  );

}


/* =========================================================
   RESET
========================================================= */

async function resetAllData() {

  try {

    const logsSnap =
      await getDocs(
        logsRef
      );


    for (
      const d
      of
      logsSnap.docs
    ) {

      await deleteDoc(
        doc(
          db,
          "logs",
          d.id
        )
      );

    }


    const playersSnap =
      await getDocs(
        playersRef
      );


    for (
      const d
      of
      playersSnap.docs
    ) {

      await deleteDoc(
        doc(
          db,
          "players",
          d.id
        )
      );

    }


  } catch (e) {

    console.error(e);


    alert(
      "Reset failed. Please try again."
    );

  }

}
