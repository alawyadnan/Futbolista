export function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function normalizePlayerName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function playerNameKey(value) {
  return normalizePlayerName(value).toLocaleLowerCase();
}

export function isValidISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function filterAndSortPlayers(players = [], stats = {}, query = "", sortBy = "name") {
  const needle = normalizeSearch(query);
  const rows = players
    .filter(player => normalizeSearch(player?.name).includes(needle))
    .map(player => ({
      ...player,
      stats: stats[String(player?.id)] || { matches: 0, goals: 0 }
    }));

  rows.sort((a, b) => {
    if (sortBy === "matches") {
      return Number(b.stats.matches || 0) - Number(a.stats.matches || 0)
        || String(a.name || "").localeCompare(String(b.name || ""));
    }
    if (sortBy === "goals") {
      return Number(b.stats.goals || 0) - Number(a.stats.goals || 0)
        || Number(b.stats.matches || 0) - Number(a.stats.matches || 0)
        || String(a.name || "").localeCompare(String(b.name || ""));
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return rows;
}

export function selectDisplayMonth(currentMonth, availableMonths = []) {
  const valid = [...new Set(availableMonths.filter(month => /^\d{4}-\d{2}$/.test(String(month))))]
    .sort((a, b) => b.localeCompare(a));
  if (valid.includes(currentMonth)) return currentMonth;
  return valid.find(month => month < currentMonth) || valid[0] || currentMonth;
}

export function buildHistoryPeriods(matches = []) {
  const months = [...new Set(matches.map(match => String(match?.date || "").slice(0, 7)))]
    .filter(month => /^\d{4}-\d{2}$/.test(month))
    .sort((a, b) => b.localeCompare(a));
  const years = [...new Set(months.map(month => month.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  return { months, years };
}

export function filterMatches(matches = [], playerNameForId = () => "", query = "", period = "all", playerId = "") {
  const needle = normalizeSearch(query);
  return matches.filter(match => {
    const date = String(match?.date || "");
    const periodMatches = period === "all"
      || (period.startsWith("month:") && date.startsWith(period.slice(6)))
      || (period.startsWith("year:") && date.startsWith(period.slice(5)));
    if (!periodMatches) return false;
    if (playerId && !(match?.parts || []).some(part => String(part.playerId) === String(playerId))) return false;
    if (!needle) return true;
    return (match?.parts || []).some(part => normalizeSearch(playerNameForId(part.playerId)).includes(needle));
  });
}

export function isResetConfirmation(value) {
  return String(value || "").trim() === "RESET";
}

export function compareMetricValues(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return "tie";
  return a > b ? "left" : "right";
}

export function buildPlayerAvatar(name) {
  const cleaned = String(name || "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const first = words[0] ? [...words[0]][0] : "";
  const second = words.length > 1
    ? [...words[words.length - 1]][0]
    : words[0] ? [...words[0]].slice(1, 2).join("") : "";
  const initials = `${first}${second}`.toLocaleUpperCase() || "?";
  let hash = 0;
  for (const character of cleaned.toLocaleLowerCase()) {
    hash = ((hash * 31) + character.codePointAt(0)) >>> 0;
  }
  return { initials, tone: hash % 5 };
}

const PUBLIC_ROUTE_SCREENS = new Set([
  "dashboard",
  "leaderboard",
  "table",
  "playerstats",
  "account",
  "history"
]);

export function parseAppRoute(hash = "") {
  const raw = String(hash || "").replace(/^#\/?/, "");
  const [route = "", first = "", third = "", fourth = ""] = raw.split("/");
  try {
    if (route === "history" && first === "player" && third) {
      return { screen: "history", playerId: "", historyPlayerId: decodeURIComponent(third).trim() };
    }
    if (route === "player" && first) {
      const playerId = decodeURIComponent(first).trim();
      if (!playerId) return { screen: "dashboard", playerId: "" };
      if (third === "compare") {
        const comparisonPlayerId = decodeURIComponent(fourth).trim();
        return { screen: "playerprofile", playerId, comparison: true, comparisonPlayerId: comparisonPlayerId === playerId ? "" : comparisonPlayerId };
      }
      return { screen: "playerprofile", playerId };
    }
    // Previously shared links keep working, but land inside the first profile.
    if (route === "compare") {
      const playerId = decodeURIComponent(first).trim(), comparisonPlayerId = decodeURIComponent(third).trim();
      return playerId && comparisonPlayerId && playerId !== comparisonPlayerId
        ? { screen: "playerprofile", playerId, comparison: true, comparisonPlayerId }
        : { screen: "playerstats", playerId: "" };
    }
  } catch { return { screen: route === "compare" ? "playerstats" : "dashboard", playerId: "" }; }
  const screen = route === "players" ? "playerstats" : route;
  return PUBLIC_ROUTE_SCREENS.has(screen) ? { screen, playerId: "" } : { screen: "dashboard", playerId: "" };
}

export function appRouteFor(screen, playerId = "") {
  if (screen === "history" && String(playerId || "").trim()) {
    return `#history/player/${encodeURIComponent(String(playerId).trim())}`;
  }
  if (screen === "playerprofile" && String(playerId || "").trim()) {
    return `#player/${encodeURIComponent(String(playerId).trim())}`;
  }
  if (screen === "playerstats") return "#players";
  return `#${PUBLIC_ROUTE_SCREENS.has(screen) ? screen : "dashboard"}`;
}

export function compareRouteFor(playerAId = "", playerBId = "") {
  const aId = String(playerAId || "").trim(), bId = String(playerBId || "").trim();
  if (!aId) return "#players";
  const route = `#player/${encodeURIComponent(aId)}/compare`;
  return bId && aId !== bId ? `${route}/${encodeURIComponent(bId)}` : route;
}

export function publicAppUrl(currentUrl, hash) {
  try {
    const url = new URL(String(currentUrl || ""));
    url.search = "";
    url.hash = String(hash || "#dashboard");
    return url.toString();
  } catch {
    return String(hash || "#dashboard");
  }
}

export function paginateItems(items = [], visibleCount = 10) {
  const count = Math.max(1, Math.floor(Number(visibleCount) || 0));
  const visible = items.slice(0, count);
  return { visible, remaining: Math.max(0, items.length - visible.length) };
}

// Keep an in-progress form stable across background snapshots or a language
// change. Values live only in this synchronous call, never in browser storage.
// The caller must not preserve across an account or form-state transition.
export function renderWithFormDraft(root, render, preserve = true) {
  const form = root?.querySelector('form');
  const active = root?.ownerDocument?.activeElement;
  const focused = !!form?.contains(active);
  const draft = preserve && form && (focused || form.dataset.dirty === 'true') ? {
    id: form.id,
    dirty: form.dataset.dirty,
    fields: [...form.elements].filter(field => field.name).map(field => ({
      name: field.name, value: field.value, checked: field.checked
    })),
    focus: focused ? active.id : '',
    start: focused ? active.selectionStart : null,
    end: focused ? active.selectionEnd : null
  } : null;
  render();
  const next = root?.querySelector('form');
  if (!draft || next?.id !== draft.id) return;
  if (draft.dirty) next.dataset.dirty = draft.dirty;
  for (const saved of draft.fields) {
    const field = next.elements.namedItem(saved.name);
    if (!field) continue;
    field.value = saved.value;
    if (typeof saved.checked === 'boolean') field.checked = saved.checked;
  }
  const target = [...next.elements].find(field => field.id === draft.focus);
  target?.focus({ preventScroll: true });
  if (target && Number.isInteger(draft.start) && Number.isInteger(draft.end)) {
    target.setSelectionRange(draft.start, draft.end);
  }
}

// Frame callbacks may be suspended by Safari or background/PWA windows. A
// bounded timer keeps data rendering from remaining queued indefinitely.
export function createRenderScheduler(render, {
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis)
} = {}) {
  let pending = null;
  return () => {
    if (pending) return;
    const ticket = { frame: null, timer: null };
    pending = ticket;
    const run = () => {
      if (pending !== ticket) return;
      pending = null;
      if (ticket.frame !== null) cancelFrame?.(ticket.frame);
      if (ticket.timer !== null) clearTimer(ticket.timer);
      render();
    };
    ticket.timer = setTimer(run, 100);
    if (requestFrame) ticket.frame = requestFrame(run);
  };
}
