import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  buildDataModel as buildFootballDataModel,
  calculateMonthScores as calculateFootballMonthScores,
  computeHeadToHead as computeFootballHeadToHead,
  computeTeammates as computeFootballTeammates
} from "./data-engine.js?v=500405";

import { countText, directionFor, translate } from "./i18n.js?v=500405";
import { computePlayerProgress, computePlayerRecords, summarizePlayerHistory } from "./insights-engine.js?v=500405";
import { readPinnedPlayer, writePinnedPlayer } from "./personalization.js?v=500405";
import { COMMUNITY_ENABLED } from "./community-config.js?v=500405";
import { resolvePublicPlayers } from "./community-engine.js?v=500405";
import { createCommunity } from "./community.js?v=500405";
import { createHighlights } from "./highlights.js?v=500405";
import { AWARD_SORT_KEYS, rankAwardRows } from "./award-statistics.js?v=500405";

import {
  appRouteFor,
  buildHistoryPeriods,
  buildPlayerAvatar,
  compareMetricValues,
  compareRouteFor,
  createRenderScheduler,
  filterAndSortPlayers,
  filterMatches,
  isResetConfirmation,
  isValidISODate,
  normalizePlayerName,
  paginateItems,
  parseAppRoute,
  playerNameKey,
  publicAppUrl,
  selectDisplayMonth
} from "./ux-utils.js?v=500405";


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


// Explicit loopback-only mode never connects emulated writes to production.
const localEmulator = ['127.0.0.1', 'localhost'].includes(location.hostname)
  && new URLSearchParams(location.search).get('emulator') === '1';
const communityEnabled = COMMUNITY_ENABLED || localEmulator;
const app = initializeApp(localEmulator ? { ...firebaseConfig, projectId: 'demo-futbolista', apiKey: 'demo-key', authDomain: 'localhost' } : firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);
if (localEmulator) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}


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
let rawPlayers = [];
let publicProfiles = new Map();
let community = null;
let highlights = null;

let rawLogs = [];

let playersLoaded = false;

let logsLoaded = false;

let loadError = false;

let retryingData = false;

let hasDataModel = false;

let snapshotGeneration = 0;

let unsubscribePlayers = null;

let unsubscribeLogs = null;

let isAdmin = false;

let currentProfileId = null;

const scheduleRender = createRenderScheduler(() => renderAll());

let addPlayerBusy = false;

let addLogBusy = false;

const pendingPlayerNames = new Set();

const pendingLogTypes = new Set();

let showPastMonths = false;

let compareOptionsSignature = "";

let comparisonOpen = false;
let comparisonPlayerId = "";

let logPlayerOptionsSignature = "";

let language = readLanguage();
let pinnedPlayerId = null;
try { pinnedPlayerId = readPinnedPlayer(localStorage); } catch {}

let playerDirectoryScrollY = 0;

let profileReturnScreen = "playerstats";

let profileReturnScrollY = 0;

let showAllTeammates = false;

let historyOptionsSignature = "";

let historyInitialized = false;

const HISTORY_PAGE_SIZE = 10;

let historyVisibleCount = HISTORY_PAGE_SIZE;
let historyPlayerId = '';

let sortedHistoryModel = null;

let sortedHistoryMatches = [];

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
    const saved = localStorage.getItem("futbolista-language");
    if (saved === "ar" || saved === "en") return saved;
  } catch {
    // Browser language remains a safe fallback when storage is unavailable.
  }
  return navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
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
  updatePageContext(screen);
  renderScreenContents(screen);
  community?.render();
  setActiveNav(screen === "playerprofile" ? "playerstats" : screen);
}


async function shareContent({ title, text, hash }) {
  const url = publicAppUrl(window.location.href, hash);
  const previousFocus = document.activeElement;
  try {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    await copyTextToClipboard(url);
    notify(t("linkCopied"));
  } catch (error) {
    console.error("Sharing failed:", error);
    notify(t("shareFailed"), "error");
  } finally {
    if (previousFocus?.isConnected && !previousFocus.closest?.(".hidden, [inert]")) {
      previousFocus.focus?.({ preventScroll: true });
    }
  }
}


async function copyTextToClipboard(url) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch {
      // Some browsers expose the API but deny it; retain the user-gesture fallback.
    }
  }
  const input = document.createElement("textarea");
  input.value = url;
  input.tabIndex = -1;
  input.setAttribute("readonly", "");
  input.setAttribute("aria-hidden", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  try {
    document.body.appendChild(input);
    input.select();
    if (!document.execCommand("copy")) throw new Error("copy-command-failed");
  } finally {
    input.remove();
  }
}


function sharePlayerProfile() {
  const player = model.playerById?.get(String(currentProfileId || ""));
  if (!player) return;
  const name = player.name || t("player");
  shareContent({
    title: `${name} · Futbolista`,
    text: t("shareProfileText", { name }),
    hash: appRouteFor("playerprofile", currentProfileId)
  });
}


function shareComparison() {
  const playerAId = String(currentProfileId || "");
  const playerBId = String($("cmpPlayerB")?.value || "");
  if (!playerAId || !playerBId || playerAId === playerBId) return;
  const playerA = model.playerById?.get(playerAId);
  const playerB = model.playerById?.get(playerBId);
  if (!playerA || !playerB) return;
  shareContent({
    title: `${playerA.name} ${t("versus")} ${playerB.name} · Futbolista`,
    text: t("shareComparisonText", { playerA: playerA.name, playerB: playerB.name }),
    hash: compareRouteFor(playerAId, playerBId)
  });
}


function updateAuthButton() {
  const button = $("btnAdminLogin");
  if (!button) return;
  button.classList.toggle("hidden", communityEnabled && !isAdmin);
  $("btnAccount")?.classList.toggle("hidden", !communityEnabled || isAdmin);
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
    if ($("loginPassword")) {
      $("loginPassword").value = "";
      $("loginPassword").type = "password";
    }
    $("btnTogglePassword")?.setAttribute("aria-pressed", "false");
    if ($("btnTogglePassword")) $("btnTogglePassword").textContent = t("showPassword");
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

  document.querySelector(".skip-link")?.addEventListener("click", event => {
    event.preventDefault();
    $("mainContent")?.focus();
  });

  if (communityEnabled) {
    if (localEmulator) $("emulatorNotice")?.classList.remove("hidden");
    $("btnAccount")?.classList.remove("hidden");
    highlights = createHighlights({ db, getModel: () => model, getProfileId: () => currentProfileId, isAdmin: () => isAdmin, t, esc, notify });
    community = createCommunity({ db, auth, getModel: () => model, getPlayers: () => players, isDataReady, t, esc, notify, openProfile,
      onResultsChanged: state => {
        highlights.setResults(state);
        // Refresh only the active rankings when a closed result arrives.
        if (!$("screen-table")?.classList.contains('hidden') && hasDataModel) renderTable();
        if (!$("screen-leaderboard")?.classList.contains('hidden') && hasDataModel) renderLeaderboard();
      },
      showAccount: () => { showScreen('account'); setActiveNav('playerstats'); },
      onProfilesChanged: profiles => { publicProfiles = profiles; players = resolvePublicPlayers(rawPlayers, profiles); scheduleRender(); }
    });
    $("btnAccount")?.addEventListener("click", () => { showScreen('account'); setActiveNav('playerstats'); });
  }

  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      const target = btn.dataset.nav;
      if (btn.dataset.admin === "1" && !isAdmin) return;
      showScreen(target);
      setActiveNav(target);
    });
  });

  document.querySelector(".brand")?.addEventListener("click", event => {
    event.preventDefault();
    currentProfileId = null;
    showScreen("dashboard");
    setActiveNav("dashboard");
  });

  $("playerCards")?.addEventListener("click", event => {
    const card = event.target.closest("[data-player-id]");
    if (card) openProfile(card.getAttribute("data-player-id"));
  });

  document.addEventListener("click", event => {
    const trigger = event.target.closest?.("[data-open-player]");
    if (trigger) openProfile(trigger.getAttribute("data-open-player"));
    const match = event.target.closest?.("[data-open-match]");
    if (match) openHistoryMatch(match.getAttribute("data-open-match"));
  });

  $("btnPinPlayer")?.addEventListener("click", () => {
    if (!currentProfileId) return;
    const next = pinnedPlayerId === currentProfileId ? null : currentProfileId;
    let saved = false;
    try { saved = writePinnedPlayer(localStorage, next); } catch {}
    if (!saved) return notify(t("pinFailed"), "warning");
    pinnedPlayerId = next;
    renderPinButton();
    notify(t(next ? "pinSaved" : "pinRemoved"));
  });

  $("btnProfileBack")?.addEventListener("click", () => {
    currentProfileId = null;
    showScreen(profileReturnScreen, { scroll: false });
    const activeScreen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "dashboard";
    setActiveNav(activeScreen);
    requestAnimationFrame(() => restoreScrollPosition(profileReturnScrollY));
  });

  $("btnCompareProfile")?.addEventListener("click", () => {
    if (!currentProfileId) return;
    comparisonOpen = true;
    renderProfileComparison();
    updateLocationForScreen("playerprofile");
    $("profileComparison")?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    $("cmpPlayerB")?.focus({ preventScroll: true });
  });
  $("btnCloseComparison")?.addEventListener("click", () => {
    comparisonOpen = false;
    renderProfileComparison();
    updateLocationForScreen("playerprofile");
    updatePageContext("playerprofile");
    $("btnCompareProfile")?.focus({ preventScroll: true });
  });
  $("cmpPlayerB")?.addEventListener("change", handleCompareSelection);

  $("btnShareProfile")?.addEventListener("click", sharePlayerProfile);
  $("btnPlayerHistory")?.addEventListener("click", () => {
    if (!currentProfileId) return;
    historyPlayerId = String(currentProfileId);
    resetHistoryControls();
    showScreen('history'); setActiveNav('history');
  });
  $("btnShareComparison")?.addEventListener("click", shareComparison);

  $("playerSearch")?.addEventListener("input", renderPlayerCardsNameOnly);
  $("playerSort")?.addEventListener("change", renderPlayerCardsNameOnly);
  $("historySearch")?.addEventListener("input", () => {
    historyVisibleCount = HISTORY_PAGE_SIZE;
    renderMatchHistory();
  });
  $("historyPeriod")?.addEventListener("change", () => {
    historyVisibleCount = HISTORY_PAGE_SIZE;
    renderMatchHistory();
  });
  $("btnClearHistory")?.addEventListener("click", () => {
    historyPlayerId = ''; resetHistoryControls(); renderMatchHistory(); updateLocationForScreen('history');
    $("historySearch")?.focus({ preventScroll: true });
  });
  $("matchHistoryList")?.addEventListener("click", event => {
    if (event.target.closest("[data-history-more]")) {
      historyVisibleCount += HISTORY_PAGE_SIZE;
      renderMatchHistory();
      return;
    }
    const button = event.target.closest("[data-match-toggle]");
    if (!button) return;
    const key = button.dataset.matchToggle;
    const expanded = !expandedMatchKeys.has(key);
    expanded ? expandedMatchKeys.add(key) : expandedMatchKeys.delete(key);
    button.setAttribute("aria-expanded", String(expanded));
    const card = button.closest(".matchCard");
    card?.classList.toggle("expanded", expanded);
    card?.classList.toggle("collapsed", !expanded);
    const details = document.getElementById(button.getAttribute("aria-controls") || "");
    if (details) details.hidden = !expanded;
    if (expanded) community?.refreshHistory();
  });
  $("btnExpandAll")?.addEventListener("click", () => {
    const matches = getFilteredMatches();
    historyVisibleCount = Math.max(HISTORY_PAGE_SIZE, matches.length);
    matches.forEach(match => expandedMatchKeys.add(String(match.matchKey)));
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
    $("profileMates")?.querySelector("[data-toggle-teammates]")?.focus({ preventScroll: true });
  });

  $("btnAdminLogin")?.addEventListener("click", window.__adminLogin);
  $("btnLanguage")?.addEventListener("click", toggleLanguage);
  $("btnExportTop")?.addEventListener("click", window.__exportNow);
  $("btnAddPlayer")?.addEventListener("click", addPlayerSafely);
  $("btnAddLog")?.addEventListener("click", addLogSafely);
  $("lbSort")?.addEventListener("change", renderLeaderboard);
  $("tableSort")?.addEventListener("change", () => {
    renderTable();
    const wrap = $('tableBody')?.closest('.tablewrap');
    if (wrap) wrap.scrollLeft = 0;
  });
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-award-table]');
    if (!trigger || !AWARD_SORT_KEYS.includes(trigger.dataset.awardTable)) return;
    $("tableSort").value = trigger.dataset.awardTable;
    showScreen('table'); setActiveNav('table');
    $("tableSort").focus({preventScroll:true});
  });
  $("btnExport")?.addEventListener("click", () => isAdmin && exportJSON());
  $("btnReset")?.addEventListener("click", () => {
    if (!isAdmin) return notify(t("adminRequired"), "warning");
    $("resetPhrase").value = "";
    $("btnResetConfirm").disabled = true;
    openModal("resetModal", "resetPhrase");
  });

  setupModals();

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#mainContent") return;
    syncScreenFromLocation();
  });

  onAuthStateChanged(auth, async user => {
    const email = String(user?.email || "").trim().toLowerCase();
    isAdmin = !!user && email === ADMIN_EMAIL.toLowerCase();
    document.body.classList.toggle("is-admin", isAdmin);
    updateAuthButton();
    updateDataActionState();

    community?.onAuth(user, isAdmin);
    highlights?.render();
    if (user && !isAdmin && !communityEnabled) {
      notify(t("invalidAdmin"), "error");
      await signOut(auth).catch(console.error);
    }

    const openAdminScreen = document.querySelector(".screen:not(.hidden)[data-admin='1']");
    if (openAdminScreen && !isAdmin) {
      showScreen("dashboard");
      setActiveNav("dashboard");
    }
  });

  startDataSubscriptions();

  syncScreenFromLocation();

  if ("serviceWorker" in navigator && !localEmulator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js?v=500405").catch(error => console.warn("Service worker registration failed:", error));
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

  if (!isDataReady()) {
    return notify(t("dataStillLoading"), "warning");
  }

  const name = normalizePlayerName($("playerName")?.value);


  if (!name) {
    return notify(t("enterName"), "warning");

  }


  const normalizedNameKey = playerNameKey(name);

  const exists = rawPlayers.some(p => playerNameKey(p.name) === normalizedNameKey)
    || pendingPlayerNames.has(normalizedNameKey);


  if (exists) {
    return notify(t("duplicatePlayer"), "warning");

  }


  const btn =
    $("btnAddPlayer");


  addPlayerBusy = true;

  pendingPlayerNames.add(normalizedNameKey);


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

    pendingPlayerNames.delete(normalizedNameKey);

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

  if (!isDataReady()) {
    return notify(t("dataStillLoading"), "warning");
  }


  const playerId =
    $("logPlayer")?.value || "";


  if (!playerId) {
    return notify(t("choosePlayer"), "warning");

  }

  if (!players.some(player => String(player.id) === String(playerId))) {
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

  if (!isValidISODate(date)) {
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

    const entry = {
        playerId,
        goals,
        result,
        side,
        ownGoal,
        date,
        createdAt: Date.now()
      };
    if (community) await community.saveMatchEntry(entry);
    else await addDoc(logsRef,entry);

    if ($("logGoals")) $("logGoals").value = "0";
    if ($("logGoalType")) $("logGoalType").value = "normal";
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

  updateDataActionState();
}


/* =========================================================
   FIREBASE ERROR
========================================================= */

function isDataReady() {
  return playersLoaded && logsLoaded && !loadError;
}


function updateDataActionState() {
  const unavailable = !isAdmin || !isDataReady();
  for (const id of ["btnExportTop", "btnExport", "btnAddPlayer", "btnAddLog"]) {
    const button = $(id);
    if (!button) continue;
    button.disabled = unavailable
      || (id === "btnAddPlayer" && addPlayerBusy)
      || (id === "btnAddLog" && addLogBusy);
  }
}


function startDataSubscriptions(retry = false) {
  const generation = ++snapshotGeneration;
  unsubscribePlayers?.();
  unsubscribeLogs?.();
  unsubscribePlayers = null;
  unsubscribeLogs = null;
  playersLoaded = false;
  logsLoaded = false;
  loadError = false;
  retryingData = retry;
  updateDataActionState();
  updateDataStatus();

  let nextPlayers = players;
  let nextLogs = rawLogs;
  const acceptedSnapshot = () => generation === snapshotGeneration && !loadError;
  const receivedSnapshot = () => {
    if (isDataReady()) {
      rawPlayers = nextPlayers;
      players = resolvePublicPlayers(rawPlayers, publicProfiles);
      rawLogs = nextLogs;
      retryingData = false;
    }
    updateDataActionState();
    scheduleRender();
  };
  const failedSnapshot = error => handleSnapshotError(error, generation);

  // No orderBy: legacy documents without createdAt remain readable.
  try {
    unsubscribePlayers = onSnapshot(playersRef, snap => {
      if (!acceptedSnapshot()) return;
      nextPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) =>
        Number(a.createdAt || 0) - Number(b.createdAt || 0)
        || String(a.name || "").localeCompare(String(b.name || ""))
      );
      playersLoaded = true;
      nextPlayers.forEach(player => pendingPlayerNames.delete(playerNameKey(player.name)));
      receivedSnapshot();
    }, failedSnapshot);

    unsubscribeLogs = onSnapshot(logsRef, snap => {
      if (!acceptedSnapshot()) return;
      nextLogs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(compareRawLogsNewestFirst);
      logsLoaded = true;
      nextLogs.forEach(log => {
        const type = isOwnGoal(log) ? "own" : "normal";
        pendingLogTypes.delete(`${matchKeyOf(log)}::${String(log.playerId || "")}::${type}`);
      });
      receivedSnapshot();
    }, failedSnapshot);
  } catch (error) {
    failedSnapshot(error);
  }
}


function handleSnapshotError(error, generation = snapshotGeneration) {
  if (generation !== snapshotGeneration || loadError) return;
  loadError = true;
  retryingData = false;
  updateDataActionState();
  notify(t("loadFailed"), "error");
  console.error("Firebase snapshot error:", error);
  scheduleRender();
}


function updateDataStatus() {
  let banner = $("dataStatusBanner");
  if (!loadError && !retryingData) {
    if (banner?.contains(document.activeElement)) $("mainContent")?.focus({ preventScroll: true });
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement("aside");
    banner.id = "dataStatusBanner";
    banner.className = "data-status-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = `<div class="data-status-copy"><strong id="dataStatusTitle"></strong><p id="dataStatusMessage"></p></div><button id="btnRetryData" type="button" class="btn btn-quiet" data-retry-data></button>`;
    banner.addEventListener("click", event => {
      if (event.target.closest?.("[data-retry-data]") && loadError) startDataSubscriptions(true);
    });
    $("mainContent")?.prepend(banner);
  }
  banner.classList.toggle("is-retrying", retryingData);
  $("dataStatusTitle").textContent = t(retryingData ? "retryingData" : "noData");
  $("dataStatusMessage").textContent = t(retryingData ? "dataStillLoading" : "loadFailed");
  $("btnRetryData").textContent = t(retryingData ? "retryingData" : "retryData");
  $("btnRetryData").disabled = retryingData;
}


/* =========================================================
   RENDER QUEUE
========================================================= */

/* =========================================================
   NAVIGATION
========================================================= */

function syncScreenFromLocation() {
  const previousScreen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "";
  const route = parseAppRoute(window.location.hash);
  currentProfileId = route.screen === "playerprofile" ? route.playerId : null;
  comparisonOpen = route.comparison === true;
  comparisonPlayerId = route.comparisonPlayerId || "";
  if (route.screen === 'history') {
    if (historyPlayerId !== (route.historyPlayerId || '')) resetHistoryControls();
    historyPlayerId = route.historyPlayerId || '';
  }
  showScreen(route.screen, { scroll: false, updateRoute: false });
  setActiveNav(route.screen === "playerprofile" ? "playerstats" : route.screen);

  const activeScreen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "");
  if (activeScreen !== route.screen) return;

  const canonical = route.screen === "playerprofile" && comparisonOpen
    ? currentComparisonRoute()
    : appRouteFor(route.screen, route.screen === 'history' ? historyPlayerId : route.playerId);
  if (window.location.hash !== canonical) window.history.replaceState(null, "", canonical);

  if (previousScreen === "playerprofile" && route.screen === profileReturnScreen) {
    requestAnimationFrame(() => restoreScrollPosition(profileReturnScrollY));
  } else if (previousScreen === "playerprofile" && route.screen === "playerstats") {
    requestAnimationFrame(() => restoreScrollPosition(playerDirectoryScrollY));
  } else if (previousScreen && previousScreen !== route.screen) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}


function updateLocationForScreen(name, { replace = false } = {}) {
  const section = document.getElementById(`screen-${name}`);
  if (!section || section.dataset.admin === "1") return;
  const nextHash = name === "playerprofile" && comparisonOpen
    ? currentComparisonRoute()
    : appRouteFor(name, name === "playerprofile" ? currentProfileId : name === 'history' ? historyPlayerId : "");
  if (window.location.hash === nextHash) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", nextHash);
}


function currentComparisonRoute() { return compareRouteFor(currentProfileId, comparisonPlayerId); }

function showScreen(
  name,
  { scroll = true, updateRoute = true, replaceRoute = false } = {}
) {

  let target = document.getElementById(`screen-${name}`);
  if (!target || (target.dataset.admin === "1" && !isAdmin)) {
    name = "dashboard";
    target = document.getElementById("screen-dashboard");
  }

  document
    .querySelectorAll(".screen")
    .forEach(
      s =>
        s.classList.add(
          "hidden"
        )
    );


  target?.classList.remove("hidden");

  updatePageContext(name);
  if (name === 'account' && !communityEnabled) { showScreen('dashboard', { scroll: false, replaceRoute: true }); return; }

  renderScreenContents(name);

  if (updateRoute) updateLocationForScreen(name, { replace: replaceRoute });
  community?.render();

  if (scroll) {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  }

}


function updatePageContext(screen, customLabel = "") {
  const titleKeys = {
    dashboard: "dashboardTitle",
    leaderboard: "leaderboard",
    table: "statsTable",
    playerstats: "playerStats",
    history: "history",
    players: "managePlayers",
    matches: "matchEntry",
    settings: "settings",
    account: "account"
  };
  const player = screen === "playerprofile"
    ? model.playerById?.get(String(currentProfileId || ""))
    : null;
  const label = customLabel || player?.name || t(titleKeys[screen] || (screen === "playerprofile" ? "profile" : "dashboardTitle"));
  document.title = `${label} · Futbolista`;
  const status = $("routeStatus");
  if (status && status.textContent !== label) status.textContent = label;
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

  return l?.ownGoal === true;

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

  updateDataStatus();

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

  hasDataModel = true;


  renderLogPlayerOptions();

  renderCompareOptions();

  const activeScreen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "dashboard";

  renderScreenContents(activeScreen);
  community?.render();

}


function renderScreenContents(screen) {

  updateDataStatus();
  if (screen === "account") { community?.render(); return; }
  if (!hasDataModel) {
    if (loadError) return renderLoadFailure(screen);
    if (!isDataReady()) return;
  }

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
  highlights?.render();

}


function renderLoadFailure(screen) {
  updateDataStatus();
  if (hasDataModel) return;
  document.querySelectorAll(`#screen-${screen} .skeleton-list`).forEach(element => {
    element.classList.remove("skeleton-list");
    element.removeAttribute("aria-busy");
    element.innerHTML = emptyState("!", t("noData"), t("noDataLead"), true);
  });
  if (screen === "table" && $("tableBody")) {
    $("tableBody").innerHTML = `<tr><td colspan="12" class="noteCell">${esc(t("noData"))}</td></tr>`;
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
  const select = $("cmpPlayerB");
  if (!select || !playersLoaded) return;
  const sorted = players.filter(player => String(player.id) !== currentProfileId).sort((a,b) => String(a.name).localeCompare(String(b.name)));
  const signature = `${language}:${currentProfileId}:` + sorted.map(player => `${player.id}:${player.name}`).join("|");
  if (signature !== compareOptionsSignature) {
    select.innerHTML = `<option value="">${esc(t("selectPlayer"))}</option>` + sorted.map(player => `<option value="${esc(player.id)}">${esc(player.name)}</option>`).join("");
    compareOptionsSignature = signature;
  }
  if (!sorted.some(player => String(player.id) === comparisonPlayerId)) comparisonPlayerId = "";
  select.value = comparisonPlayerId;
}

function renderProfileComparison() {
  $("profileComparison")?.classList.toggle("hidden", !comparisonOpen);
  $("btnCompareProfile")?.setAttribute("aria-expanded", String(comparisonOpen));
  $("btnCompareProfile")?.setAttribute("aria-controls", "profileComparison");
  if (!comparisonOpen) return;
  renderCompareOptions();
  renderCompare();
}

function handleCompareSelection() {
  comparisonPlayerId = $("cmpPlayerB")?.value || "";
  renderCompare();
  updateLocationForScreen("playerprofile", { replace: true });
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

          <button type="button" class="item player-link" data-open-player="${esc(r.id)}">

            <div>

              <div class="name">
                ${medal(i)} <bdi dir="auto">${esc(r.name)}</bdi>
              </div>

              <div class="meta form-meta">
                <span>${esc(t("score"))}: <b>${formatFormPoints(r.formPoints)}</b></span>
                ${renderFormDots(r.formResults)}
              </div>

            </div><span class="sr-only">${esc(t("openProfileAction"))}</span>

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

    <button type="button" class="item player-link" data-open-player="${esc(r.playerId)}">

      <div>

        <div class="name">
          ${medal(i)} <bdi dir="auto">${esc(r.name)}</bdi>
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

      </div><span class="sr-only">${esc(t("openProfileAction"))}</span>

    </button>

  `;

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {
  renderPinnedPlayer();

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

                `${medal(i)} <bdi dir="auto">${esc(x.p.name)}</bdi>`,

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

                `${medal(i)} <bdi dir="auto">${esc(x.p.name)}</bdi>`,

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

                `${medal(i)} <bdi dir="auto">${esc(x.p.name)}</bdi>`,

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

function rankingRows(sortBy) {
  const awardSort = communityEnabled && AWARD_SORT_KEYS.includes(sortBy);
  const snapshot = highlights?.getStatistics();
  const rows = players.filter(p => awardSort || model.eligibleIds.has(String(p.id))).map(p => {
    const id = String(p.id), s = model.stats[id] || emptyStats();
    const form = model.forms[id] || {formPoints:0,formIcons:'',formResults:[]};
    const awards = snapshot?.byPlayer.get(id);
    return {id, name:p.name || '', matches:s.matches, wins:s.wins, goals:s.goals, winPct:s.winPct,
      gpm:s.gpm, curStreak:s.current, bestStreak:s.best, formPoints:form.formPoints,
      formIcons:form.formIcons, formResults:form.formResults || [],
      votingPoints:awards?.votingPoints || 0, motmAwards:awards?.motmAwards || 0, monthAwards:awards?.monthAwards || 0};
  });
  const ready = sortBy === 'monthAwards' || snapshot?.complete;
  // Never publish an apparently final ordering from a partially loaded archive.
  return {rows: awardSort ? (ready ? rankAwardRows(rows,sortBy) : []) : rows.sort(sorter(sortBy)),
    awardSort, complete:!!snapshot?.complete, pending:awardSort && !ready, error:!!snapshot?.error};
}

function rankingStatus(error) {
  return `<p class="note" role="status">${esc(t(error ? 'awardLoadError' : 'loadingMvp'))}</p>${error ? `<button type="button" class="btn btn-quiet" data-community-action="retry-results">${esc(t('retryData'))}</button>` : ''}`;
}

function renderLeaderboard() {

  const sortBy =
    $("lbSort")?.value
    ||
    "form";


  const { rows, awardSort, complete, pending, error } = rankingRows(sortBy);


  const box =
    $("leaderboardList");


  if (!box) {

    return;

  }


  box.innerHTML = pending ? rankingStatus(error) :
    rows.length
      ?
      rows
        .map(
          (
            r,
            i
          ) => `

            <button type="button" class="item leader-row player-link" data-open-player="${esc(r.id)}">
              <div class="leader-main">
                <span class="rank-badge ${(awardSort ? r.rank !== null && r.rank <= 3 : i < 3) ? "top" : ""}">${awardSort ? r.rank ?? '—' : i + 1}</span>
                <div class="leader-copy">
                  <div class="name"><bdi dir="auto">${esc(r.name)}</bdi></div>
                  <div class="leader-metrics">
                    ${communityEnabled ? `<span class="metric-chip ${sortBy === 'votingPoints' ? 'is-sort-key' : ''}">${esc(t('votingPoints'))} <strong>${complete ? r.votingPoints : '—'}</strong></span><span class="metric-chip ${sortBy === 'motmAwards' ? 'is-sort-key' : ''}">MOTM <strong>${complete ? r.motmAwards : '—'}</strong></span><span class="metric-chip ${sortBy === 'monthAwards' ? 'is-sort-key' : ''}">${esc(t('monthAwards'))} <strong>${r.monthAwards}</strong></span>` : ''}
                    <span class="metric-chip ${sortBy === "form" ? "is-sort-key" : ""}">${esc(t("form"))} <strong>${formatFormPoints(r.formPoints)}</strong></span>
                    <span class="metric-chip">${renderFormDots(r.formResults)}</span>
                    <span class="metric-chip ${sortBy === "matches" ? "is-sort-key" : ""}">${esc(t("matches"))} <strong>${r.matches}</strong></span>
                    <span class="metric-chip ${sortBy === "wins" ? "is-sort-key" : ""}">${esc(t("wins"))} <strong>${r.wins}</strong></span>
                    <span class="metric-chip ${sortBy === "goals" ? "is-sort-key" : ""}">${esc(t("goals"))} <strong>${r.goals}</strong></span>
                    <span class="metric-chip ${sortBy === "winPct" ? "is-sort-key" : ""}">${esc(t("winPct"))} <strong>${fmtPct(r.winPct)}</strong></span>
                    <span class="metric-chip ${sortBy === "gpm" ? "is-sort-key" : ""}">${esc(t("gpm"))} <strong>${fmt2(r.gpm)}</strong></span>
                    <span class="metric-chip ${sortBy === "curStreak" || sortBy === "bestStreak" ? "is-sort-key" : ""}">${esc(t("current"))} <strong>${r.curStreak}</strong> · ${esc(t("best"))} ${r.bestStreak}</span>
                  </div>
                </div>
              </div><span class="sr-only">${esc(t("openProfileAction"))}</span>
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


  const { rows, awardSort, complete, pending, error } = rankingRows(sortBy);


  const body =
    $("tableBody");


  if (!body) {

    return;

  }


  if ($('tableScope')) $('tableScope').textContent = t(awardSort ? 'allPlayersRanking' : 'allEligible');
  // On narrow screens, bring the requested award metric beside the player name.
  body.closest('table')?.classList.toggle('award-sorted', awardSort);
  body.innerHTML = pending ? `<tr><td colspan="12">${rankingStatus(error)}</td></tr>` :
    rows.length
      ?
      rows
        .map(
          (
            r,
            idx
          ) => `

            <tr>

              <td>${awardSort ? r.rank ?? '—' : idx + 1}</td>

              <td data-sort-key="name"><button type="button" class="inline-player-link table-player-link" data-open-player="${esc(r.id)}"><bdi dir="auto">${esc(r.name)}</bdi><span class="sr-only"> ${esc(t("openProfileAction"))}</span></button></td>

              <td data-sort-key="votingPoints" data-award-stat>${complete ? r.votingPoints : '—'}</td>

              <td data-sort-key="motmAwards" data-award-stat>${complete ? r.motmAwards : '—'}</td>

              <td data-sort-key="monthAwards" data-award-stat>${r.monthAwards}</td>

              <td data-sort-key="matches">${r.matches}</td>

              <td data-sort-key="wins">${r.wins}</td>

              <td data-sort-key="goals">${r.goals}</td>

              <td data-sort-key="winPct">${fmtPct(r.winPct)}</td>

              <td data-sort-key="gpm">${fmt2(r.gpm)}</td>

              <td data-sort-key="curStreak">${r.curStreak}</td>

              <td data-sort-key="bestStreak">${r.bestStreak}</td>

            </tr>

          `
        )
        .join("")

      :

      `<tr><td colspan="12" class="noteCell">${esc(t("noRanked"))}</td></tr>`;

  const table = body.closest("table");
  table?.querySelectorAll('tr').forEach(row => {
    const keys = awardSort ? [sortBy, ...AWARD_SORT_KEYS.filter(key => key !== sortBy)] : AWARD_SORT_KEYS;
    const cells = keys.map(key => row.querySelector(`[data-sort-key="${key}"]`)).filter(Boolean);
    if (awardSort) cells.reverse().forEach(cell => row.insertBefore(cell,row.children[2]));
    else cells.forEach(cell => row.appendChild(cell));
    cells.forEach(cell => { cell.hidden = !communityEnabled; });
  });
  table?.querySelectorAll("[data-sort-key]").forEach(cell => {
    cell.classList.toggle("is-sort-key", cell.dataset.sortKey === sortBy);
  });
  table?.querySelectorAll("thead th[aria-sort]").forEach(header => header.removeAttribute("aria-sort"));
  const activeHeader = table?.querySelector(`thead th[data-sort-key="${sortBy}"]`);
  activeHeader?.setAttribute("aria-sort", sortBy === "name" ? "ascending" : "descending");

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
          >

            <div class="pName">
              <bdi dir="auto">${esc(p.name || "")}</bdi>
              <span class="pCardMeta">${esc(countText(language, p.stats.matches || 0, "match"))} · ${esc(countText(language, p.stats.goals || 0, "goal"))}</span>
            </div><span class="sr-only">${esc(t("openProfileAction"))}</span>

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

  const sourceScreen = document.querySelector(".screen:not(.hidden)")?.id?.replace("screen-", "") || "playerstats";
  if (sourceScreen !== "playerprofile") {
    profileReturnScreen = sourceScreen;
    profileReturnScrollY = window.scrollY;
    if (sourceScreen === "playerstats") playerDirectoryScrollY = window.scrollY;
  }

  showAllTeammates = false;
  comparisonOpen = false;
  comparisonPlayerId = "";

  currentProfileId =
    String(pid);


  showScreen(
    "playerprofile"
  );


  setActiveNav(
    "playerstats"
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
    if (playersLoaded) {
      currentProfileId = null;
      notify(t("playerNotFound"), "warning");
      showScreen("playerstats", { scroll: false, replaceRoute: true });
      setActiveNav("playerstats");
    }
    return;

  }

  updatePageContext("playerprofile", p.name || t("profile"));


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

  if (grid && communityEnabled) grid.insertAdjacentHTML('beforeend', '<div id="profileMotmStat" class="statTile motm-stat"></div><div id="profileVotePointsStat" class="statTile motm-stat"></div><div id="profileMonthAwardsStat" class="statTile motm-stat"></div>');
  const record = $("profileRecord");
  if (record) {
    const resultTotal = s.wins + s.draws + s.losses;
    const recordSeparator = language === "ar" ? " · " : ", ";
    const recordLabel = [countText(language, s.wins, "win"), countText(language, s.draws, "draw"), countText(language, s.losses, "loss")].join(recordSeparator);
    record.innerHTML = `
      <div class="record-heading"><strong>${esc(t("resultsRecord"))}</strong><span>${esc(recordLabel)}</span></div>
      <div class="record-track" role="img" aria-label="${esc(recordLabel)}">
        ${resultTotal ? `<span class="record-segment win" style="flex-grow:${s.wins}"></span><span class="record-segment draw" style="flex-grow:${s.draws}"></span><span class="record-segment loss" style="flex-grow:${s.losses}"></span>` : `<span class="record-segment empty"></span>`}
      </div>
      <div class="record-legend" aria-hidden="true"><span class="win">${esc(t("shortWin"))} ${s.wins}</span><span class="draw">${esc(t("shortDraw"))} ${s.draws}</span><span class="loss">${esc(t("shortLoss"))} ${s.losses}</span></div>`;
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
  renderProfileInsights(String(pid));
  renderPinButton();
  renderProfileComparison();
  const publicProfile = community?.getProfile(pid);
  if ($("profileSub") && publicProfile?.preferredNumber !== null && publicProfile?.preferredNumber !== undefined) {
    $("profileSub").textContent = `${t("preferredNumber")} · ${publicProfile.preferredNumber}`;
  }


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
    return `<button type="button" class="profile-match-row" data-open-match="${esc(participation.matchKey)}">
      <span class="result-badge ${participation.result}" aria-label="${esc(t(participation.result))}">${esc(shortResultLabel(participation.result))}</span>
      <div><strong>${esc(formatMatchDate(participation.date))}</strong><span>${esc(teamLabel(participation.side))} · ${esc(countText(language, participation.normalGoals, "goal"))}</span></div>
      ${ownGoal}<b dir="ltr" aria-label="${esc(match ? t("matchScoreAria", { a: match.scoreA, b: match.scoreB }) : "—")}">${score}</b><span class="sr-only">${esc(t("details"))}</span>
    </button>`;
  }).join("");
}

function renderPinButton() {
  const button = $("btnPinPlayer");
  if (!button) return;
  const pinned = pinnedPlayerId === currentProfileId;
  button.setAttribute("aria-pressed", String(pinned));
  button.innerHTML = `<span aria-hidden="true">${pinned ? "★" : "☆"}</span><span>${esc(t(pinned ? "unpinPlayer" : "pinPlayer"))}</span>`;
}

function renderPinnedPlayer() {
  const box = $("pinnedPlayer");
  if (!box) return;
  const player = players.find(p => String(p.id) === pinnedPlayerId);
  box.classList.toggle("hidden", !player);
  if (!player) { box.replaceChildren(); return; }
  const stats = model.stats[pinnedPlayerId] || emptyStats();
  const avatar = buildPlayerAvatar(player.name);
  box.innerHTML = `<button type="button" class="pinned-link" data-open-player="${esc(player.id)}">
    <span class="pinned-avatar" data-avatar-tone="${avatar.tone}" aria-hidden="true">${esc(avatar.initials)}</span>
    <span class="pinned-identity"><span class="eyebrow">${esc(t("pinnedPlayer"))}</span><strong><bdi dir="auto">${esc(player.name)}</bdi></strong></span>
    <span class="pinned-stats"><span><b>${stats.goals}</b> ${esc(t("goals"))}</span><span><b>${fmtPct(stats.winPct)}</b> ${esc(t("winPct"))}</span></span>
    <span class="sr-only">${esc(t("openProfileAction"))}</span></button>`;
}

function appearanceWindowLabel(count) {
  return count === 1 ? t("lastAppearance") : count === 2 ? t("lastTwoAppearances") : t("lastAppearances", { count });
}

function renderProfileInsights(pid) {
  const box = $("profileInsights");
  if (!box) return;
  const progress = computePlayerProgress(model, pid);
  const records = computePlayerRecords(model, pid);
  if (!progress.current.matches) { box.replaceChildren(); return; }
  const maxGoals = Math.max(1, ...progress.recentMatches.map(match => match.goals));
  const chart = progress.recentMatches.map(match => {
    const label = `${formatMatchDate(match.date)} · ${t(match.result)} · ${countText(language, match.goals, "goal")}`;
    return `<button type="button" class="goal-column ${match.result}" data-open-match="${esc(match.matchKey)}" aria-label="${esc(label + ". " + t("details"))}" title="${esc(label)}">
      <span class="goal-stem"><span class="goal-value">${match.goals}</span><span class="goal-bar" style="height:${Math.max(3, match.goals / maxGoals * 92)}px"></span></span>
      <span class="goal-result">${esc(shortResultLabel(match.result))}</span></button>`;
  }).join("");
  const progressRow = (label, key, format = String, deltaKey = key) => {
    const delta = progress.deltas?.[deltaKey] || 0;
    const change = delta ? `<bdi dir="ltr">${delta > 0 ? "+" : "−"}${Math.abs(delta)}</bdi>${key === "winPct" ? ` <span>${esc(t("percentagePoints"))}</span>` : ""}` : esc(t("unchanged"));
    return `<tr><th scope="row">${esc(t(label))}</th><td>${esc(format(progress.current[key]))}</td><td>${esc(format(progress.previous[key]))}</td><td class="progress-delta ${delta > 0 ? "positive" : delta < 0 ? "negative" : ""}">${change}</td></tr>`;
  };
  const best = records.bestScoringMatch;
  const recordTile = (value, label, detail, key = null) => `<${key ? "button type=\"button\"" : "div"} class="personal-record" ${key ? `data-open-match="${esc(key)}"` : ""}><span>${esc(t(label))}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small>${key ? `<span class="sr-only">${esc(t("details"))}</span>` : ""}</${key ? "button" : "div"}>`;
  box.innerHTML = `
    <article class="card goals-card"><div class="card-heading"><h2>${esc(t("goalTimeline"))}</h2><span class="status-pill">${esc(appearanceWindowLabel(progress.recentMatches.length))}</span></div>
      <div class="goals-chart" dir="ltr">${chart}</div><div class="chart-axis" dir="ltr"><span>${esc(t("oldest"))}</span><span>${esc(t("newest"))}</span></div>
      <div class="chart-legend">${["win", "draw", "loss"].map(result => `<span class="${result}"><i aria-hidden="true"></i>${esc(t(result))}</span>`).join("")}</div>
    </article>
    <article class="card progress-card"><div class="card-heading"><h2>${esc(t("playerProgress"))}</h2></div>
      ${progress.canCompare ? `<table class="progress-table"><thead><tr><th scope="col"><span class="sr-only">${esc(t("individualStats"))}</span></th><th scope="col">${esc(t("currentFive"))}</th><th scope="col">${esc(t("previousFive"))}</th><th scope="col">${esc(t("performanceChange"))}</th></tr></thead><tbody>${progressRow("goals", "goals")}${progressRow("wins", "wins")}${progressRow("winPct", "winPct", fmtPct, "winPctPoints")}</tbody></table>` : `<div class="progress-preview">${tile(t("goals"), progress.current.goals)}${tile(t("winPct"), fmtPct(progress.current.winPct))}</div><p class="note">${esc(appearanceWindowLabel(progress.current.matches))} · ${esc(t("comparisonUnlock"))}</p>`}
    </article>
    <article class="card records-card"><div class="card-heading"><h2>${esc(t("personalRecords"))}</h2></div><div class="personal-records">
      ${recordTile(best?.goals || 0, "bestScoringMatch", best ? formatMatchDate(best.date) : "—", best?.latestMatchKey)}
      ${recordTile(records.hatTricks, "hatTricks", t("hatTrickThreshold"))}
      ${recordTile(fmtPct(records.scoringRate), "scoredIn", countText(language, records.scoringMatches, "match"))}
      ${recordTile(records.unbeatenBest, "unbeatenBest", t("unbeatenNow", { count: records.unbeatenCurrent }))}
    </div></article>`;
}

function openHistoryMatch(matchKey) {
  const index = getSortedMatches().findIndex(match => String(match.matchKey) === String(matchKey));
  if (index < 0) return;
  historyPlayerId = '';
  if ($("historySearch")) $("historySearch").value = "";
  if ($("historyPeriod")) $("historyPeriod").value = "all";
  historyVisibleCount = Math.max(HISTORY_PAGE_SIZE, index + 1);
  expandedMatchKeys.add(String(matchKey));
  historyInitialized = true;
  showScreen("history", { scroll: false });
  setActiveNav("history");
  requestAnimationFrame(() => {
    const button = [...document.querySelectorAll("[data-match-toggle]")].find(item => item.dataset.matchToggle === String(matchKey));
    button?.scrollIntoView({ block: "start", behavior: "instant" });
    button?.focus({ preventScroll: true });
  });
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

              <button type="button" class="mateRow player-link" data-open-player="${esc(id)}">

                <div class="playerName">
                  <span class="mate-rank" aria-hidden="true">${index + 1}</span>
                  <bdi dir="auto">${esc(playerName(id))}</bdi>
                </div><span class="sr-only">${esc(t("openProfileAction"))}</span>

                <div class="mate-count-badge">
                  ${esc(countText(language, c, "match"))}
                </div>

              </button>

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
  const allMatches = getSortedMatches();
  renderHistoryOptions(allMatches);
  const matches = getFilteredMatches(allMatches);
  renderHistorySelection(matches);
  if (!allMatches.length) {
    box.innerHTML = emptyState("◷", t("noMatches"), t("noMatchesLead"));
    return;
  }
  if (!historyInitialized) {
    expandedMatchKeys.add(String(allMatches[0].matchKey));
    historyInitialized = true;
  }
  if (!matches.length) {
    box.innerHTML = emptyState("⌕", t("noFilteredMatches"), t("noFilteredMatchesLead"));
    return;
  }

  const page = paginateItems(matches, historyVisibleCount);

  box.innerHTML = page.visible.map((match, index) => {
    const key = String(match.matchKey);
    const expanded = expandedMatchKeys.has(key);
    const outcomeA = match.scoreA > match.scoreB ? "winners" : match.scoreA < match.scoreB ? "losers" : "draw";
    const outcomeB = match.scoreB > match.scoreA ? "winners" : match.scoreB < match.scoreA ? "losers" : "draw";
    const labelForOutcome = outcome => t(outcome === "draw" ? "tie" : outcome);
    const detailsId = `match-details-${index}`;
    const participation = historyPlayerId ? match.parts.find(part => part.playerId === historyPlayerId) : null;
    return `
      <article class="matchCard ${expanded ? "expanded" : "collapsed"}">
        <button type="button" class="matchTop match-summary" data-match-toggle="${esc(key)}" aria-expanded="${expanded}" aria-controls="${detailsId}">
          <span class="matchDate"><span>${esc(t("matchday"))}</span><time datetime="${esc(match.date)}">${esc(formatMatchDate(match.date))}</time></span>
          <span class="match-summary-end"><span class="matchScore labeled-score" dir="ltr" aria-label="${esc(t('matchScoreAria',{a:match.scoreA,b:match.scoreB}))}"><span class="${outcomeA}" aria-hidden="true"><small dir="auto">${esc(t('teamA'))}</small><b>${match.scoreA}</b></span><span class="score-divider" aria-hidden="true">:</span><span class="${outcomeB}" aria-hidden="true"><small dir="auto">${esc(t('teamB'))}</small><b>${match.scoreB}</b></span></span><span class="match-chevron" aria-hidden="true">⌄</span></span>
        </button>
        ${participation ? `<div class="history-appearance"><span class="result-badge ${participation.result}">${esc(t(participation.result))}</span><span>${esc(teamLabel(participation.side))}</span><strong>${esc(countText(language,participation.normalGoals,'goal'))}</strong>${participation.ownGoals ? `<span class="own-goal-tag">${esc(t('ownGoals'))} · ${participation.ownGoals}</span>` : ''}</div>` : ''}
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
          ${community?.historyMarkup(key) || ''}
        </div>
      </article>`;
  }).join("") + (page.remaining ? `
    <button type="button" class="btn btn-quiet history-more" data-history-more>
      <span>${esc(t("showMoreMatches"))}</span><strong>${page.remaining}</strong>
    </button>` : "");
  community?.refreshHistory();
}


function getSortedMatches() {
  if (sortedHistoryModel === model) return sortedHistoryMatches;
  sortedHistoryModel = model;
  sortedHistoryMatches = Array.from(model.matchSummaries.values()).sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
    || Number(b.createdAt || 0) - Number(a.createdAt || 0)
  );
  return sortedHistoryMatches;
}


function getFilteredMatches(sortedMatches = getSortedMatches()) {
  return filterMatches(sortedMatches, playerName, $("historySearch")?.value || "", $("historyPeriod")?.value || "all", historyPlayerId);
}

function resetHistoryControls() {
  if ($('historySearch')) $('historySearch').value = '';
  if ($('historyPeriod')) $('historyPeriod').value = 'all';
  historyVisibleCount = HISTORY_PAGE_SIZE;
}

function renderHistorySelection(matches) {
  const active = !!(historyPlayerId || $('historySearch')?.value.trim() || $('historyPeriod')?.value !== 'all');
  $('historySearch')?.closest('.field')?.classList.toggle('hidden', !!historyPlayerId);
  document.querySelector('#screen-history .screen-intro .eyebrow')?.classList.toggle('hidden', !!historyPlayerId);
  $('btnClearHistory')?.classList.toggle('hidden', !active);
  if ($('historyCount')) $('historyCount').textContent = countText(language,matches.length,'match');
  const box = $('historyPlayerSummary');
  if (!box) return;
  box.classList.toggle('hidden', !historyPlayerId);
  if (!historyPlayerId) { box.replaceChildren(); return; }
  const player = players.find(item => String(item.id) === historyPlayerId);
  const name = player?.name || t('unknown');
  const avatar = buildPlayerAvatar(name);
  const stats = summarizePlayerHistory(matches,historyPlayerId);
  box.innerHTML = `<div class="history-player-heading"><span class="pinned-avatar" data-avatar-tone="${avatar.tone}" aria-hidden="true">${esc(avatar.initials)}</span><div><div class="eyebrow">${esc(t('playerMatchHistory'))}</div><h2><bdi dir="auto">${esc(name)}</bdi></h2></div>${player ? `<button type="button" class="btn btn-quiet" data-open-player="${esc(historyPlayerId)}">${esc(t('profile'))}</button>` : ''}</div>
    <dl class="history-player-totals">${[['win','wins'],['draw','draws'],['loss','losses'],['goals','goals']].map(([label,key]) => `<div class="${label}"><dt>${esc(t(label))}</dt><dd>${stats[key]}</dd></div>`).join('')}</dl>${stats.ownGoals ? `<p class="note">${esc(t('ownGoals'))} · ${stats.ownGoals}</p>` : ''}`;
}


function renderHistoryOptions(sortedMatches = getSortedMatches()) {
  const select = $("historyPeriod");
  if (!select) return;
  const periods = buildHistoryPeriods(sortedMatches);
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

              <button type="button" class="playerName inline-player-link" data-open-player="${esc(x.playerId)}">
                <bdi dir="auto">${esc(name)}</bdi>
                ${ownGoalBadge}
                <span class="sr-only">${esc(t("openProfileAction"))}</span>
              </button>

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

  const aId = String(currentProfileId || "");


  const bId =
    String(
      $("cmpPlayerB")?.value
      ||
      ""
    );


  const box =
    $("compareResult");

  const shareButton =
    $("btnShareComparison");


  if (!box) {

    return;

  }

  shareButton?.classList.add("hidden");


  if (
    !aId
    ||
    !bId
    ||
    aId === bId
  ) {

    box.replaceChildren();
    updatePageContext("playerprofile");


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

  shareButton?.classList.remove("hidden");
  updatePageContext("compare", `${aPlayer.name} ${t("versus")} ${bPlayer.name}`);


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

        <button type="button" class="compareName compare-player-a inline-player-link" data-open-player="${esc(aId)}">
          <span class="compare-avatar" aria-hidden="true">${esc(buildPlayerAvatar(aPlayer.name).initials)}</span>
          <bdi dir="auto">${esc(aPlayer.name)}</bdi><span class="sr-only"> ${esc(t("openProfileAction"))}</span>
        </button>

        <div class="compareVs">
          ${esc(t("versus"))}
        </div>

        <button type="button" class="compareName compare-player-b inline-player-link" data-open-player="${esc(bId)}">
          <span class="compare-avatar" aria-hidden="true">${esc(buildPlayerAvatar(bPlayer.name).initials)}</span>
          <bdi dir="auto">${esc(bPlayer.name)}</bdi><span class="sr-only"> ${esc(t("openProfileAction"))}</span>
        </button>

      </div>

    </div>


    <div class="card">

      <h2 class="card-title">
        ${esc(t("headToHead"))}
      </h2>

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


    <div class="card compare-together">

      <h2 class="card-title">
        ${esc(t("teammatesRecord"))}
      </h2>

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

      <h2 class="card-title">
        ${esc(t("individualStats"))}
      </h2>

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

    <div class="compareStatLine compare-metric">

      <div class="compareSide ${leftBetter ? "better" : ""}">
        <span>${esc(aDisplay)}</span>
        ${leftBetter ? `<span class="sr-only">${esc(t("bestLabel"))}</span>` : ""}
      </div>

      <div class="compareCenter">
        ${esc(label)}
        ${tied ? `<span class="sr-only">${esc(t("tie"))}</span>` : ""}
      </div>

      <div class="compareSide ${rightBetter ? "better" : ""}">
        <span>${esc(bDisplay)}</span>
        ${rightBetter ? `<span class="sr-only">${esc(t("bestLabel"))}</span>` : ""}
      </div>

      <div class="compare-bars" aria-hidden="true"><span style="--bar-width:${aRaw > 0 ? aRaw / Math.max(aRaw, bRaw) * 100 : 0}%"></span><span style="--bar-width:${bRaw > 0 ? bRaw / Math.max(aRaw, bRaw) * 100 : 0}%"></span></div>
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

    <button type="button" class="item player-link" data-open-player="${esc(playerId)}">

      <div>

        <div class="name">
          ${titleMarkup}
        </div>

        <div class="meta">
          ${metaMarkup}
        </div>

      </div><span class="sr-only">${esc(t("openProfileAction"))}</span>

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

  if (!isAdmin) return notify(t("adminRequired"), "warning");
  if (!isDataReady()) return notify(t("dataStillLoading"), "warning");

  /*
    Export RAW Firebase data,
    not aggregated data.

    This preserves the true backup.
  */

  const data = {

    exportedAt:
      new Date()
        .toISOString(),

    players: rawPlayers,

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

  let deletedLogs = 0;
  let deletedPlayers = 0;

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

      deletedLogs += 1;

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

      deletedPlayers += 1;

    }

    notify(t("resetDone"));


  } catch (e) {

    console.error(e);


    notify(
      deletedLogs || deletedPlayers
        ? t("resetPartial", { logs: deletedLogs, players: deletedPlayers })
        : t("resetFailed"),
      "error"
    );

  }

}
