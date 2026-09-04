export function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase();
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

export function filterMatches(matches = [], playerNameForId = () => "", query = "", period = "all") {
  const needle = normalizeSearch(query);
  return matches.filter(match => {
    const date = String(match?.date || "");
    const periodMatches = period === "all"
      || (period.startsWith("month:") && date.startsWith(period.slice(6)))
      || (period.startsWith("year:") && date.startsWith(period.slice(5)));
    if (!periodMatches) return false;
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
