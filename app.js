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

import {
  buildDataModel as buildFootballDataModel,
  calculateMonthScores as calculateFootballMonthScores,
  computeHeadToHead as computeFootballHeadToHead,
  computeTeammates as computeFootballTeammates
} from "./data-engine.js?v=500106";

import { countText, directionFor, translate } from "./i18n.js?v=500106";

import {
  buildHistoryPeriods,
  buildPlayerAvatar,
  compareMetricValues,
  filterAndSortPlayers,
  filterMatches,
  isResetConfirmation,
  selectDisplayMonth
} from "./ux-utils.js?v=500106";


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

let playersLoaded = false;

let logsLoaded = false;

let loadError = false;

let isAdmin = false;

let currentProfileId = null;

let renderQueued = false;

let addPlayerBusy = false;

let addLogBusy = false;

const pendingPlayerNames = new Set();

const pendingLogTypes = new Set();

let showPastMonths = false;

let compareOptionsSignature = "";

let logPlayerOptionsSignature = "";

let language = readLanguage();

let playerDirectoryScrollY = 0;

let showAllTeammates = false;

let historyOptionsSignature = "";

let historyInitialized = false;

const expandedMatchKeys = new Set();

let activeModal = null;

let modalReturnFocus = null;

let model = emptyModel();


const $ = (id) => (
  document.getElementById(id)
);


const t = (key, variables = {}) => translate(language, key, variables);


const shortResultLabel = result => ({
  win: t("shortWin"),
  draw: t("shortDraw"),
  loss: t("shortLoss")
}[result] || "—");


const teamLabel = side => (
  side === "A"
    ? t("teamA")
    : side === "B"
      ? t("teamB")
      : `${t("team")} ${String(side || "")}`.trim()
);


function readLanguage() {
  try {
    return localStorage.getItem("futbolista-language") === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}


function notify(message, type = "success") {
  const region = $("toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = String(message);
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}


/* =========================================================
   ADMIN LOGIN
========================================================= */

window.__adminLogin = async () => {
  if (isAdmin && auth.currentUser) {
    try {
      await signOut(auth);
      showScreen("dashboard");
      setActiveNav("dashboard");
      notify(t("signedOut"));
    } catch (error) {
      console.error(error);
      notify(t("loginFailed"), "error");
    }
    return;
  }
  openModal("loginModal", "loginEmail");
};


window.__exportNow = () => {

  if (isAdmin) {

    exportJSON();

  }

};


function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = directionFor(language);
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(element => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  compareOptionsSignature = "";
  logPlayerOptionsSignature = "";
  historyOptionsSignature = "";
  updateAuthButton();
}


function toggleLanguage() {
  language = language === "en" ? "ar" : "en";
  try {
    localStorage.setItem("futbolista-language", language);
  } catch (error) {
    console.warn("Language preference could not be saved:", error);
  }
  applyLanguage();
  renderLogPlayerOptions();
  renderCompareOptions();
  const screen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "dashboard";
  renderScreenContents(screen);
  setActiveNav(screen === "playerprofile" ? "playerstats" : screen);
}


function updateAuthButton() {
  const button = $("btnAdminLogin");
  if (!button) return;
  button.innerHTML = isAdmin
    ? `<span aria-hidden="true">↪</span><span>${esc(t("logout"))}</span>`
    : `<span aria-hidden="true">⌁</span><span>${esc(t("adminLogin"))}</span>`;
}


function setupModals() {
  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", closeModal);
  });
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) closeModal();
    });
  });
  document.addEventListener("keydown", handleModalKeydown);

  $("btnTogglePassword")?.addEventListener("click", () => {
    const input = $("loginPassword");
    const button = $("btnTogglePassword");
    if (!input || !button) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.setAttribute("aria-pressed", String(!visible));
    button.textContent = t(visible ? "showPassword" : "hidePassword");
  });

  $("loginForm")?.addEventListener("submit", handleLoginSubmit);
  $("resetPhrase")?.addEventListener("input", event => {
    $("btnResetConfirm").disabled = !isResetConfirmation(event.target.value);
  });
  $("resetForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!isAdmin || !isResetConfirmation($("resetPhrase")?.value)) return;
    const button = $("btnResetConfirm");
    setButtonBusy(button, true, t("resetting"));
    closeModal();
    await resetAllData();
    setButtonBusy(button, false, t("confirmReset"));
  });
}


async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = $("loginEmail");
  const passwordInput = $("loginPassword");
  const errorBox = $("loginError");
  const button = $("btnLoginSubmit");
  const email = String(emailInput?.value || "").trim();
  const password = String(passwordInput?.value || "");
  if (!emailInput?.checkValidity() || !password) {
    errorBox.textContent = t("loginFailed");
    errorBox.hidden = false;
    emailInput?.focus();
    return;
  }
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    errorBox.textContent = t("invalidAdmin");
    errorBox.hidden = false;
    emailInput.focus();
    return;
  }
  errorBox.hidden = true;
  setButtonBusy(button, true, t("signingIn"));
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const authorized = String(credential.user?.email || "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!authorized) throw new Error("unauthorized-admin-account");
    passwordInput.value = "";
    closeModal();
  } catch (error) {
    console.error(error);
    errorBox.textContent = t("loginFailed");
    errorBox.hidden = false;
    passwordInput.value = "";
    passwordInput.focus();
  } finally {
    setButtonBusy(button, false, t("signIn"));
  }
}


function openModal(id, focusId) {
  const modal = $(id);
  if (!modal) return;
  modalReturnFocus = document.activeElement;
  activeModal = modal;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  document.querySelectorAll(".topbar, .app, .bottomnav").forEach(element => {
    element.inert = true;
  });
  requestAnimationFrame(() => $(focusId)?.focus());
}


function closeModal() {
  if (!activeModal) return;
  activeModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  document.querySelectorAll(".topbar, .app, .bottomnav").forEach(element => {
    element.inert = false;
  });
  if (activeModal.id === "loginModal") {
    if ($("loginPassword")) $("loginPassword").value = "";
    if ($("loginError")) $("loginError").hidden = true;
  }
  const previous = modalReturnFocus;
  activeModal = null;
  modalReturnFocus = null;
  previous?.focus?.();
}


function handleModalKeydown(event) {
  if (!activeModal) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...activeModal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")]
    .filter(element => !element.hidden && element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}


/* =========================================================
   STARTUP
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  applyLanguage();
  if ($("logDate")) $("logDate").value = localISODate();

  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      const target = btn.dataset.nav;
      if (btn.dataset.admin === "1" && !isAdmin) return;
      showScreen(target);
      setActiveNav(target);
    });
  });

  $("playerCards")?.addEventListener("click", event => {
    const card = event.target.closest("[data-player-id]");
    if (card) openProfile(card.getAttribute("data-player-id"));
  });

  document.addEventListener("click", event => {
    const trigger = event.target.closest?.("[data-open-player]");
    if (trigger) openProfile(trigger.getAttribute("data-open-player"));
  });

  $("btnProfileBack")?.addEventListener("click", () => {
    currentProfileId = null;
    showScreen("playerstats", { scroll: false });
    setActiveNav("playerstats");
    requestAnimationFrame(() => restoreScrollPosition(playerDirectoryScrollY));
  });

  $("cmpPlayerA")?.addEventListener("change", renderCompare);
  $("cmpPlayerB")?.addEventListener("change", renderCompare);
  $("btnSwapPlayers")?.addEventListener("click", () => {
    const a = $("cmpPlayerA");
    const b = $("cmpPlayerB");
    if (!a || !b) return;
    [a.value, b.value] = [b.value, a.value];
    renderCompare();
  });

  $("playerSearch")?.addEventListener("input", renderPlayerCardsNameOnly);
  $("playerSort")?.addEventListener("change", renderPlayerCardsNameOnly);
  $("historySearch")?.addEventListener("input", renderMatchHistory);
  $("historyPeriod")?.addEventListener("change", renderMatchHistory);
  $("matchHistoryList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-match-toggle]");
    if (!button) return;
    const key = button.dataset.matchToggle;
    expandedMatchKeys.has(key) ? expandedMatchKeys.delete(key) : expandedMatchKeys.add(key);
    renderMatchHistory();
  });
  $("btnExpandAll")?.addEventListener("click", () => {
    getFilteredMatches().forEach(match => expandedMatchKeys.add(String(match.matchKey)));
    renderMatchHistory();
  });
  $("btnCollapseAll")?.addEventListener("click", () => {
    expandedMatchKeys.clear();
    historyInitialized = true;
    renderMatchHistory();
  });

  $("profileMates")?.addEventListener("click", event => {
    if (!event.target.closest("[data-toggle-teammates]")) return;
    showAllTeammates = !showAllTeammates;
    if (currentProfileId) renderTeammates(currentProfileId);
  });

  $("btnAdminLogin")?.addEventListener("click", window.__adminLogin);
  $("btnLanguage")?.addEventListener("click", toggleLanguage);
  $("btnExportTop")?.addEventListener("click", window.__exportNow);
  $("btnAddPlayer")?.addEventListener("click", addPlayerSafely);
  $("btnAddLog")?.addEventListener("click", addLogSafely);
  $("lbSort")?.addEventListener("change", renderLeaderboard);
  $("tableSort")?.addEventListener("change", renderTable);
  $("btnExport")?.addEventListener("click", () => isAdmin && exportJSON());
  $("btnReset")?.addEventListener("click", () => {
    if (!isAdmin) return notify(t("adminRequired"), "warning");
    $("resetPhrase").value = "";
    $("btnResetConfirm").disabled = true;
    openModal("resetModal", "resetPhrase");
  });

  setupModals();

  onAuthStateChanged(auth, async user => {
    const email = String(user?.email || "").trim().toLowerCase();
    isAdmin = !!user && email === ADMIN_EMAIL.toLowerCase();
    document.body.classList.toggle("is-admin", isAdmin);
    updateAuthButton();

    if (user && !isAdmin) {
      notify(t("invalidAdmin"), "error");
      await signOut(auth).catch(console.error);
    }

    const openAdminScreen = document.querySelector(".screen:not(.hidden)[data-admin='1']");
    if (openAdminScreen && !isAdmin) {
      showScreen("dashboard");
      setActiveNav("dashboard");
    }
  });

  /* No orderBy: legacy Firestore documents without createdAt remain readable. */
  onSnapshot(playersRef, snap => {
    players = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) =>
      Number(a.createdAt || 0) - Number(b.createdAt || 0)
      || String(a.name || "").localeCompare(String(b.name || ""))
    );
    playersLoaded = true;
    players.forEach(player => pendingPlayerNames.delete(String(player.name || "").trim().toLowerCase()));
    scheduleRender();
  }, handleSnapshotError);

  onSnapshot(logsRef, snap => {
    rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(compareRawLogsNewestFirst);
    logsLoaded = true;
    rawLogs.forEach(log => {
      const type = isOwnGoal(log) ? "own" : "normal";
      pendingLogTypes.delete(`${matchKeyOf(log)}::${String(log.playerId || "")}::${type}`);
    });
    scheduleRender();
  }, handleSnapshotError);

  showScreen("dashboard", { scroll: false });
  setActiveNav("dashboard");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js?v=500106").catch(error => console.warn("Service worker registration failed:", error));
    }, { once: true });
  }
});


/* =========================================================
   SAFE INPUT
========================================================= */

async function addPlayerSafely() {

  if (!isAdmin) {
    return notify(t("adminRequired"), "warning");

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
    return notify(t("enterName"), "warning");

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
    ) || pendingPlayerNames.has(name.toLowerCase());


  if (exists) {
    return notify(t("duplicatePlayer"), "warning");

  }


  const btn =
    $("btnAddPlayer");


  addPlayerBusy = true;

  pendingPlayerNames.add(name.toLowerCase());


  setButtonBusy(
    btn,
    true,
    t("adding")
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

    notify(t("playerAdded", { name }));


  } catch (e) {

    pendingPlayerNames.delete(name.toLowerCase());

    console.error(e);


    notify(t("playerAddFailed"), "error");


  } finally {

    addPlayerBusy = false;


    setButtonBusy(
      btn,
      false,
      t("addPlayer")
    );

  }

}


/* =========================================================
   SAFE MATCH ENTRY
========================================================= */

async function addLogSafely() {

  if (!isAdmin) {
    return notify(t("adminRequired"), "warning");

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
    return notify(t("choosePlayer"), "warning");

  }


  const goals =
    clampInt(
      $("logGoals")?.value,
      0,
      99
    );

  const goalsInput = Number($(`logGoals`)?.value);

  if (!Number.isInteger(goalsInput) || goalsInput < 0 || goalsInput > 99) {
    return notify(t("invalidGoals"), "warning");
  }


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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return notify(t("invalidDate"), "warning");
  }

  if (!["win", "draw", "loss"].includes(result) || !["A", "B"].includes(side)) {
    return notify(t("invalidSelection"), "warning");
  }

  const pendingKey = `${date}::${playerId}::${ownGoal ? "own" : "normal"}`;

  if (pendingLogTypes.has(pendingKey)) {
    return notify(t("alreadySaving"), "warning");
  }


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
        ? t("ownGoal")
        : t("normal");


    return notify(t("duplicateEntry", { type: typeName }), "warning");

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

      return notify(t("metadataMismatch"), "warning");

    }

  }


  const btn =
    $("btnAddLog");


  addLogBusy = true;

  pendingLogTypes.add(pendingKey);


  setButtonBusy(
    btn,
    true,
    t("saving")
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

    notify(t("saved"));


  } catch (e) {

    pendingLogTypes.delete(pendingKey);

    console.error(e);


    notify(t("saveFailed"), "error");


  } finally {

    addLogBusy = false;


    setButtonBusy(
      btn,
      false,
      t("saveEntry")
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

  loadError = true;

  notify(t("loadFailed"), "error");

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
  name,
  { scroll = true } = {}
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

  renderScreenContents(name);

  if (scroll) {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  }

}


function setActiveNav(
  name
) {

  document
    .querySelectorAll(
      ".navbtn"
    )
    .forEach(
      b => {
        b.classList.remove("active");
        b.removeAttribute("aria-current");
      }
    );


  const el =
    document.querySelector(
      `.navbtn[data-nav="${name}"]`
    );


  el?.classList.add(
    "active"
  );

  el?.setAttribute("aria-current", "page");


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

    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
      inline: "center"
    });

  }

}


function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}


function restoreScrollPosition(top) {
  document.documentElement.classList.add("restoring-scroll");
  window.scrollTo({ top, behavior: "auto" });
  requestAnimationFrame(() => document.documentElement.classList.remove("restoring-scroll"));
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
   MAIN RENDER
========================================================= */

function renderAll() {

  if (loadError) {
    renderLoadFailure(document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "dashboard");
    return;
  }

  if (!playersLoaded || !logsLoaded) {
    return;
  }

  /*
    One model calculation
    for the entire app.
  */

  model =
    buildFootballDataModel(players, rawLogs);


  renderLogPlayerOptions();

  renderCompareOptions();

  const activeScreen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "dashboard";

  renderScreenContents(activeScreen);

}


function renderScreenContents(screen) {

  if (loadError) return renderLoadFailure(screen);
  if (!playersLoaded || !logsLoaded) return;

  if (screen === "dashboard") {
    renderInForm();
    renderPlayerOfMonth();
    renderDashboard();
  } else if (screen === "leaderboard") {
    renderLeaderboard();
  } else if (screen === "table") {
    renderTable();
  } else if (screen === "playerstats") {
    renderPlayerCardsNameOnly();
  } else if (screen === "playerprofile" && currentProfileId) {
    renderPlayerProfile(currentProfileId);
  } else if (screen === "compare") {
    renderCompare();
  } else if (screen === "history") {
    renderMatchHistory();
  } else if (screen === "players") {
    renderPlayersAdmin();
  } else if (screen === "matches") {
    renderLogs();
  }

  document.querySelectorAll(`#screen-${screen} .skeleton-list`).forEach(element => {
    element.classList.remove("skeleton-list");
    element.removeAttribute("aria-busy");
  });

}


function renderLoadFailure(screen) {
  document.querySelectorAll(`#screen-${screen} .skeleton-list`).forEach(element => {
    element.classList.remove("skeleton-list");
    element.removeAttribute("aria-busy");
    element.innerHTML = emptyState("!", t("noData"), t("noDataLead"), true);
  });
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
    `${language}:` + sorted
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
    `${language}:` + sorted
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

    `<option value="">${esc(t("selectPlayer"))}</option>`

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
              formResults: [],
              totalPlayerMatches: 0
            };


          const s =
            model.stats[pid]
            ||
            emptyStats();


          return {

            id:
              pid,

            name:
              p.name || "",

            formPoints:
              form.formPoints,

            formIcons:
              form.formIcons,

            formResults:
              form.formResults || [],

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

    box.innerHTML = emptyState("◉", t("noRanked"), t("noRankedLead"), true);


    return;

  }


  box.innerHTML =
    rows
      .map(
        (
          r,
          i
        ) => `

          <button type="button" class="item player-link" data-open-player="${esc(r.id)}" aria-label="${esc(t("openProfile", { name: r.name }))}">

            <div>

              <div class="name">
                ${medal(i)} ${esc(r.name)}
              </div>

              <div class="meta">

                ${esc(t("score"))}:
                <b>${formatFormPoints(r.formPoints)}</b>

                ·

                ${esc(t("last5"))}:
                ${renderFormDots(r.formResults)}

              </div>

            </div>

          </button>

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

  const availableMonths = Array.from(model.participationsByMonth?.keys?.() || [])
    .filter(month => calculateMonthScores(month).length > 0);

  const displayMonth = selectDisplayMonth(currentMonth, availableMonths);

  const currentRows =
    calculateMonthScores(
      displayMonth
    )
    .slice(
      0,
      3
    );


  const pastMonths =
    Array
      .from(
        new Set(

          availableMonths

        )
      )
      .filter(
        m =>

          /^\d{4}-\d{2}$/
            .test(m)

          &&

          m !== displayMonth
      )
      .sort(
        (
          a,
          b
        ) =>
          b.localeCompare(a)
      );

  if ($("playerOfMonthMonth")) {
    $("playerOfMonthMonth").textContent = formatMonthLabel(displayMonth);
  }


  if (
    !currentRows.length
  ) {

    box.innerHTML =

      emptyState("★", t("noMonthly"), t("noMonthlyLead"), true)

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

                                    ${esc(countText(language, r.matches, "match"))}

                                    ·

                                    ${esc(countText(language, r.goals, "goal"))}

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
            ? t("hidePast")
            : t("showPast")
        }

      </button>

    </div>

    ${details}

  `;

}


/* =========================================================
   MONTHLY SCORE
========================================================= */

function calculateMonthScores(monthKey) {
  return calculateFootballMonthScores(model, monthKey, playerName);
}


function monthPlayerItem(
  r,
  i
) {

  return `

    <button type="button" class="item player-link" data-open-player="${esc(r.playerId)}" aria-label="${esc(t("openProfile", { name: r.name }))}">

      <div>

        <div class="name">
          ${medal(i)} ${esc(r.name)}
        </div>

        <div class="meta">

          ${esc(t("score"))}
          <b>${fmt1(r.score)}/10</b>

          ·

          ${esc(t("matches"))}
          <b>${r.matches}</b>

          ·

          ${esc(t("shortWin"))}
          <b>${r.wins}</b>

          ·

          ${esc(t("shortDraw"))}
          <b>${r.draws}</b>

          ·

          ${esc(t("shortLoss"))}
          <b>${r.losses}</b>

          ·

          ${esc(t("goals"))}
          <b>${r.goals}</b>

        </div>

      </div>

    </button>

  `;

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  if ($("seasonMatches")) $("seasonMatches").textContent = model.totalMatches;
  if ($("seasonPlayers")) $("seasonPlayers").textContent = players.length;

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

                `${esc(countText(language, x.s.goals, "goal"))} · ${esc(t("gpm"))} ${fmt2(x.s.gpm)} · ${esc(t("winPct"))} ${fmtPct(x.s.winPct)}`,

                x.p.id,

                x.p.name

              )

          )
          .join("")

        :

        emptyState("⚽", t("noRanked"), t("noRankedLead"), true);

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

                `${esc(t("current"))}: ${x.s.current} · ${esc(t("best"))}: ${x.s.best} · ${esc(countText(language, x.s.matches, "match"))}`,

                x.p.id,

                x.p.name

              )

          )
          .join("")

        :

        emptyState("⚡", t("noRanked"), t("noRankedLead"), true);

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

                `${esc(t("winPct"))} ${fmtPct(x.s.winPct)} · ${esc(t("wins"))} ${x.s.wins}/${x.s.matches} · ${esc(countText(language, x.s.goals, "goal"))}`,

                x.p.id,

                x.p.name

              )

          )
          .join("")

        :

        emptyState("◎", t("noRanked"), t("noRankedLead"), true);

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
              formIcons: "",
              formResults: []
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
              form.formIcons,

            formResults:
              form.formResults || []

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

            <button type="button" class="item leader-row player-link" data-open-player="${esc(r.id)}" aria-label="${esc(t("openProfile", { name: r.name }))}">
              <div class="leader-main">
                <span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span>
                <div class="leader-copy">
                  <div class="name">${esc(r.name)}</div>
                  <div class="leader-metrics">
                    <span class="metric-chip">${esc(t("form"))} <strong>${formatFormPoints(r.formPoints)}</strong></span>
                    <span class="metric-chip">${renderFormDots(r.formResults)}</span>
                    <span class="metric-chip">${esc(t("matches"))} <strong>${r.matches}</strong></span>
                    <span class="metric-chip">${esc(t("wins"))} <strong>${r.wins}</strong></span>
                    <span class="metric-chip">${esc(t("goals"))} <strong>${r.goals}</strong></span>
                    <span class="metric-chip">${esc(t("winPct"))} <strong>${fmtPct(r.winPct)}</strong></span>
                    <span class="metric-chip">${esc(t("gpm"))} <strong>${fmt2(r.gpm)}</strong></span>
                    <span class="metric-chip">${esc(t("current"))} <strong>${r.curStreak}</strong> · ${esc(t("best"))} ${r.bestStreak}</span>
                  </div>
                </div>
              </div>
            </button>

          `
        )
        .join("")

      :

      emptyState("♛", t("noRanked"), t("noRankedLead"));

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

      `<tr><td colspan="9" class="noteCell">${esc(t("noRanked"))}</td></tr>`;

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
    box.innerHTML = emptyState("◉", t("noPlayers"), t("noPlayersLead"));


    return;

  }


  box.classList.remove(
    "note"
  );


  const sorted = filterAndSortPlayers(
    players,
    model.stats,
    $("playerSearch")?.value || "",
    $("playerSort")?.value || "name"
  );

  if (!sorted.length) {
    box.innerHTML = emptyState("⌕", t("noSearchPlayers"), t("noSearchPlayersLead"));
    return;
  }


  box.innerHTML =
    sorted
      .map(
        p => {
          const avatar = buildPlayerAvatar(p.name);
          return `

          <button type="button"
            class="pCard pCardNameOnly"
            data-player-id="${esc(p.id)}"
            data-initial="${esc(avatar.initials)}"
            data-avatar-tone="${avatar.tone}"
            aria-label="${esc(t("openProfile", { name: p.name || t("player") }))}"
          >

            <div class="pName">
              ${esc(p.name || "")}
              <span class="pCardMeta">${esc(countText(language, p.stats.matches || 0, "match"))} · ${esc(countText(language, p.stats.goals || 0, "goal"))}</span>
            </div>

          </button>

        `;
        }
      )
      .join("");

}


/* =========================================================
   PROFILE
========================================================= */

function openProfile(
  pid
) {

  playerDirectoryScrollY = window.scrollY;

  showAllTeammates = false;

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
      p.name || t("player");

  }

  if ($("profileInitial")) {
    const avatar = buildPlayerAvatar(p.name || "P");
    $("profileInitial").textContent = avatar.initials;
    $("profileInitial").dataset.avatarTone = String(avatar.tone);
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
          t("matches"),
          s.matches
        ),

        tile(
          t("goals"),
          s.goals,
          "highlight"
        ),

        tile(
          t("wins"),
          s.wins
        ),

        tile(
          t("winPct"),
          fmtPct(
            s.winPct
          ),
          "highlight"
        ),

        tile(
          t("gpm"),
          fmt2(
            s.gpm
          )
        ),

        tile(
          t("currentStreak"),
          s.current
        ),

        tile(
          t("bestWinStreak"),
          s.best,
          "highlight"
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
      formIcons: "",
      formResults: []
    };


  if (
    $("profileForm")
  ) {

    $("profileForm").innerHTML = form.formResults?.length
      ? renderFormDots(form.formResults, true)
      : `<span class="note">${esc(t("noForm"))}</span>`;

  }

  renderProfileMatches(String(pid));


  renderTeammates(
    pid
  );

}


function renderProfileMatches(pid) {
  const box = $("profileMatches");
  if (!box) return;
  const matches = (model.byPlayer.get(pid) || []).slice(-5).reverse();
  if (!matches.length) {
    box.innerHTML = emptyState("◷", t("noMatches"), t("noProfileMatches"), true);
    return;
  }
  box.innerHTML = matches.map(participation => {
    const match = model.matchSummaries.get(participation.matchKey);
    const score = match ? `${match.scoreA}–${match.scoreB}` : "—";
    const ownGoal = participation.ownGoals ? `<span class="own-goal-tag">${esc(t("ownGoal"))}${participation.ownGoals > 1 ? ` ×${participation.ownGoals}` : ""}</span>` : "";
    return `<div class="profile-match-row">
      <span class="result-badge ${participation.result}" aria-label="${esc(t(participation.result))}">${esc(shortResultLabel(participation.result))}</span>
      <div><strong>${esc(formatMatchDate(participation.date))}</strong><span>${esc(teamLabel(participation.side))} · ${esc(countText(language, participation.normalGoals, "goal"))}</span></div>
      ${ownGoal}<b>${score}</b>
    </div>`;
  }).join("");
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
        t("noTeammates");

    } else {

      matesBox.classList.remove(
        "note"
      );


      const visibleMates = showAllTeammates ? sorted : sorted.slice(0, 10);

      matesBox.innerHTML =
        visibleMates
          .map(
            (
              [
                id,
                c
              ],
              index
            ) => `

              <div class="mateRow">

                <div class="playerName">
                  <span class="mate-rank" aria-hidden="true">${index + 1}</span>
                  ${esc(playerName(id))}
                </div>

                <div class="mate-count-badge">
                  ${esc(countText(language, c, "match"))}
                </div>

              </div>

            `
          )
          .join("")
        + (sorted.length > 10 ? `<button type="button" class="btn btn-quiet mates-toggle" data-toggle-teammates>${esc(t(showAllTeammates ? "showLess" : "showAll"))} <span aria-hidden="true">${showAllTeammates ? "↑" : "↓"}</span></button>` : "");

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

      neverBox.classList.remove("note");
      neverBox.innerHTML = `<div class="never-chips">${never.map(name => `<span class="never-chip">${esc(name)}</span>`).join("")}</div>`;

    }

  }

}


function computeTeammates(pid) {
  return computeFootballTeammates(model, pid);
}


/* =========================================================
   MATCH HISTORY
========================================================= */

function renderMatchHistory() {
  const box = $("matchHistoryList");
  if (!box) return;
  renderHistoryOptions();
  const allMatches = getSortedMatches();
  if (!allMatches.length) {
    box.innerHTML = emptyState("◷", t("noMatches"), t("noMatchesLead"));
    return;
  }
  const matches = getFilteredMatches();
  if (!historyInitialized) {
    expandedMatchKeys.add(String(allMatches[0].matchKey));
    historyInitialized = true;
  }
  if (!matches.length) {
    box.innerHTML = emptyState("⌕", t("noFilteredMatches"), t("noFilteredMatchesLead"));
    return;
  }

  box.innerHTML = matches.map((match, index) => {
    const key = String(match.matchKey);
    const expanded = expandedMatchKeys.has(key);
    const outcomeA = match.scoreA > match.scoreB ? "winners" : match.scoreA < match.scoreB ? "losers" : "draw";
    const outcomeB = match.scoreB > match.scoreA ? "winners" : match.scoreB < match.scoreA ? "losers" : "draw";
    const labelForOutcome = outcome => t(outcome === "draw" ? "tie" : outcome);
    const detailsId = `match-details-${index}`;
    return `
      <article class="matchCard ${expanded ? "expanded" : "collapsed"}">
        <button type="button" class="matchTop match-summary" data-match-toggle="${esc(key)}" aria-expanded="${expanded}" aria-controls="${detailsId}">
          <span class="matchDate"><span>${esc(t("matchday"))}</span><time datetime="${esc(match.date)}">${esc(formatMatchDate(match.date))}</time></span>
          <span class="match-summary-end"><span class="matchScore">${match.scoreA} : ${match.scoreB}</span><span class="match-chevron" aria-hidden="true">⌄</span></span>
        </button>
        <div id="${detailsId}" class="match-details" ${expanded ? "" : "hidden"}>
          <div class="matchGrid">
            <section class="teamBox ${outcomeA}" aria-label="${esc(t("teamA"))}">
              <div class="teamTitle"><span>${esc(t("teamA"))}</span><strong>${esc(labelForOutcome(outcomeA))}</strong></div>
              ${sideLines(match.teamA)}
            </section>
            <section class="teamBox ${outcomeB}" aria-label="${esc(t("teamB"))}">
              <div class="teamTitle"><span>${esc(t("teamB"))}</span><strong>${esc(labelForOutcome(outcomeB))}</strong></div>
              ${sideLines(match.teamB)}
            </section>
          </div>
        </div>
      </article>`;
  }).join("");
}


function getSortedMatches() {
  return Array.from(model.matchSummaries.values()).sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
    || Math.max(...b.parts.map(part => part.createdAt || 0), 0) - Math.max(...a.parts.map(part => part.createdAt || 0), 0)
  );
}


function getFilteredMatches() {
  return filterMatches(getSortedMatches(), playerName, $("historySearch")?.value || "", $("historyPeriod")?.value || "all");
}


function renderHistoryOptions() {
  const select = $("historyPeriod");
  if (!select) return;
  const periods = buildHistoryPeriods(getSortedMatches());
  const signature = `${language}:${periods.months.join("|")}:${periods.years.join("|")}`;
  if (signature === historyOptionsSignature) return;
  const current = select.value || "all";
  select.innerHTML = `<option value="all">${esc(t("allDates"))}</option>`
    + periods.months.map(month => `<option value="month:${month}">${esc(t("month"))}: ${esc(formatMonthLabel(month))}</option>`).join("")
    + periods.years.map(year => `<option value="year:${year}">${esc(t("year"))}: ${esc(year)}</option>`).join("");
  if ([...select.options].some(option => option.value === current)) select.value = current;
  historyOptionsSignature = signature;
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

          const ownGoalBadge = x.ownGoals > 0
            ? `<span class="own-goal-tag">${esc(t("ownGoal"))}${x.ownGoals > 1 ? ` ×${x.ownGoals}` : ""}</span>`
            : "";


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
                ${ownGoalBadge}
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

                  ${esc(t("matches"))}
                  <b>${s.matches}</b>

                  ·

                  ${esc(t("wins"))}
                  <b>${s.wins}</b>

                  ·

                  ${esc(t("goals"))}
                  <b>${s.goals}</b>

                  ·

                  ${esc(t("winPct"))}
                  <b>${fmtPct(s.winPct)}</b>

                  ·

                  ${esc(t("gpm"))}
                  <b>${fmt2(s.gpm)}</b>

                  ·

                  ${esc(t("streak"))}
                  <b>${s.current}</b>

                  (${esc(t("best"))} ${s.best})

                </div>

              </div>

            </div>

          `;

        }
      )
      .join("");


  box.innerHTML =
    html || emptyState("◉", t("noPlayers"), t("addFirstPlayer"));

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

                  ${esc(t(result))}

                  ${own ? ` · ${esc(t("ownGoal"))}` : ""}

                  ${duplicate ? ` · ${esc(t("duplicate"))}` : ""}

                </div>


                <div class="meta">

                  ${esc(l.date || "")}

                  ·

                  ${esc(teamLabel(side))}

                  ·

                  ${esc(t("goals"))}:
                  <b>${Number(l.goals || 0)}</b>

                </div>

              </div>

            </div>

          `;

        }
      )
      .join("")

    ||

    emptyState("＋", t("noEntries"), t("noEntriesLead"));

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

    box.innerHTML = emptyState("⇄", t("readyMatchup"), t("selectTwo"), true);


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

    box.innerHTML = emptyState("!", t("playersNotFound"), t("playersNotFoundLead"), true);


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
      formResults: [],
      formPoints: 0
    };


  const bForm =
    model.forms[bId]
    ||
    {
      formIcons: "",
      formResults: [],
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
          ${esc(t("versus"))}
        </div>

        <div class="compareName">
          ${esc(bPlayer.name)}
        </div>

      </div>

    </div>


    <div class="card">

      <div class="card-title">
        ${esc(t("headToHead"))}
      </div>

      <div class="compareRows">

        ${
          compareCenterValueRow(
            t("againstEachOther"),
            h2h.againstMatches
          )
        }

        ${
          compareCompactDualRow(
            t("wins"),
            h2h.aWinsAgainst,
            h2h.bWinsAgainst
          )
        }

        ${
          compareCenterValueRow(
            t("draws"),
            h2h.drawsAgainst
          )
        }

      </div>

    </div>


    <div class="card">

      <div class="card-title">
        ${esc(t("teammatesRecord"))}
      </div>

      <div class="compareRows">

        ${
          compareCenterValueRow(
            t("matches"),
            h2h.togetherMatches
          )
        }

        ${
          compareCenterValueRow(
            t("wins"),
            h2h.togetherWins
          )
        }

        ${
          compareCenterValueRow(
            t("losses"),
            h2h.togetherLosses
          )
        }

        ${
          compareCenterValueRow(
            t("draws"),
            h2h.togetherDraws
          )
        }

      </div>

    </div>


    <div class="card">

      <div class="card-title">
        ${esc(t("individualStats"))}
      </div>

      <div class="compareTable">

        ${
          compareStatLine(
            t("matches"),
            aStats.matches,
            bStats.matches,
            aStats.matches,
            bStats.matches
          )
        }

        ${
          compareStatLine(
            t("goals"),
            aStats.goals,
            bStats.goals,
            aStats.goals,
            bStats.goals
          )
        }

        ${
          compareStatLine(
            t("wins"),
            aStats.wins,
            bStats.wins,
            aStats.wins,
            bStats.wins
          )
        }

        ${
          compareStatLine(
            t("winPct"),
            fmtPct(aStats.winPct),
            fmtPct(bStats.winPct),
            aStats.winPct,
            bStats.winPct
          )
        }

        ${
          compareStatLine(
            t("gpm"),
            fmt2(aStats.gpm),
            fmt2(bStats.gpm),
            aStats.gpm,
            bStats.gpm
          )
        }

        ${
          compareStatLine(
            t("bestWinStreak"),
            aStats.best,
            bStats.best,
            aStats.best,
            bStats.best
          )
        }

        ${
          compareFormStatLine(
            t("form"),
            renderFormDots(aForm.formResults || []),
            renderFormDots(bForm.formResults || []),
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

function computeHeadToHead(aId, bId) {
  return computeFootballHeadToHead(model, aId, bId);
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

  const outcome = aRaw === null || bRaw === null ? "tie" : compareMetricValues(aRaw, bRaw);
  const leftBetter = outcome === "left";
  const rightBetter = outcome === "right";
  const tied = outcome === "tie";


  return `

    <div class="compareStatLine">

      <div class="compareSide ${leftBetter ? "better" : ""}">
        <span>${esc(aDisplay)}</span>
        ${leftBetter ? `<span class="better-tag"><span aria-hidden="true">✓</span> ${esc(t("bestLabel"))}</span>` : ""}
      </div>

      <div class="compareCenter">
        ${esc(label)}
        ${tied ? `<span class="tie-tag"><span aria-hidden="true">=</span> ${esc(t("tie"))}</span>` : ""}
      </div>

      <div class="compareSide ${rightBetter ? "better" : ""}">
        <span>${esc(bDisplay)}</span>
        ${rightBetter ? `<span class="better-tag"><span aria-hidden="true">✓</span> ${esc(t("bestLabel"))}</span>` : ""}
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

  const outcome = aRaw === null || bRaw === null ? "tie" : compareMetricValues(aRaw, bRaw);
  const leftBetter = outcome === "left";
  const rightBetter = outcome === "right";
  const tied = outcome === "tie";


  return `

    <div class="compareStatLine compareStatLineForm">

      <div class="compareSide compareFormSide ${leftBetter ? "better" : ""}">
        <span>${aDisplay}</span>
        ${leftBetter ? `<span class="better-tag"><span aria-hidden="true">✓</span> ${esc(t("bestLabel"))}</span>` : ""}
      </div>

      <div class="compareCenter">
        ${esc(label)}
        ${tied ? `<span class="tie-tag"><span aria-hidden="true">=</span> ${esc(t("tie"))}</span>` : ""}
      </div>

      <div class="compareSide compareFormSide ${rightBetter ? "better" : ""}">
        <span>${bDisplay}</span>
        ${rightBetter ? `<span class="better-tag"><span aria-hidden="true">✓</span> ${esc(t("bestLabel"))}</span>` : ""}
      </div>

    </div>

  `;

}


/* =========================================================
   HELPERS
========================================================= */

function tile(
  label,
  value,
  tone = ""
) {

  return `

    <div class="statTile ${esc(tone)}">

      <div class="stLabel">
        ${esc(label)}
      </div>

      <div class="stValue">
        ${esc(value)}
      </div>

    </div>

  `;

}


function emptyState(icon, title, message, compact = false) {
  return `
    <div class="empty-state ${compact ? "compact" : ""}">
      <span class="empty-icon" aria-hidden="true">${esc(icon)}</span>
      <strong>${esc(title)}</strong>
      <p>${esc(message)}</p>
    </div>
  `;
}


function renderFormDots(results, large = false) {
  if (!Array.isArray(results) || !results.length) return `<span class="note">—</span>`;
  const label = { win: t("win"), draw: t("draw"), loss: t("loss") };
  return `<span class="result-dots ${large ? "large" : ""}" aria-label="${esc(results.map(result => label[result] || label.loss).join(", "))}">${results.map(result => {
    const safeResult = result === "win" || result === "draw" ? result : "loss";
    return `<span class="result-dot ${safeResult}" title="${esc(label[safeResult])}">${esc(label[safeResult].charAt(0))}</span>`;
  }).join("")}</span>`;
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

    model.playerById?.get(String(id))
    ?.name

    ||

    t("unknown")

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


function formatMatchDate(date) {
  const parts = String(date || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return String(date || "");
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-gregory" : "en", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(parts[0], parts[1] - 1, parts[2]));
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
      language === "ar" ? "ar-SA-u-ca-gregory" : "en",
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
  titleMarkup,
  metaMarkup,
  playerId = "",
  playerDisplayName = ""
) {

  return `

    <button type="button" class="item player-link" data-open-player="${esc(playerId)}" aria-label="${esc(t("openProfile", { name: playerDisplayName }))}">

      <div>

        <div class="name">
          ${titleMarkup}
        </div>

        <div class="meta">
          ${metaMarkup}
        </div>

      </div>

    </button>

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

  notify(t("backupDone"));

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

    notify(t("resetDone"));


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


    notify(t("resetFailed"), "error");

  }

}
