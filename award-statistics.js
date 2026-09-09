import { calculateMonthScores } from './data-engine.js?v=500404';

export const AWARD_SORT_KEYS = Object.freeze(['votingPoints', 'motmAwards', 'monthAwards']);

// Read-only derived statistics. The existing monthly formula, eligibility and
// tie-break order remain authoritative; the current month is not an earned award.
export function buildAwardStatistics(model, awards, currentMonth, nameForPlayer = id => model.playerById.get(id)?.name || '') {
  const byPlayer = new Map();
  for (const player of model?.playerById?.values() || []) {
    const id = String(player.id);
    byPlayer.set(id, { id, name: player.name || '', votingPoints: 0, motmAwards: awards.byPlayer.get(id)?.length || 0,
      firstChoices: 0, secondChoices: 0, thirdChoices: 0, scoredMatches: 0, monthAwards: 0, months: [] });
  }
  // byMatch already excludes open votes and imported duplicate sessions. Points
  // come from validated ballot tallies, not award wins or the number of voters.
  for (const { result } of awards.byMatch.values()) {
    if (!(result.totalBallots > 0)) continue;
    const seen = new Set();
    for (const entry of result.ranking || []) {
      const row = byPlayer.get(entry.playerId);
      if (!row || seen.has(entry.playerId) || !Number.isSafeInteger(entry.points) || entry.points <= 0) continue;
      seen.add(entry.playerId);
      row.votingPoints += entry.points;
      row.scoredMatches++;
      for (const [key, source] of [['firstChoices','first'], ['secondChoices','second'], ['thirdChoices','third']]) {
        if (Number.isSafeInteger(entry[source]) && entry[source] >= 0) row[key] += entry[source];
      }
    }
  }
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(currentMonth)) {
    for (const month of [...(model.participationsByMonth?.keys() || [])].sort()) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= currentMonth) continue;
      const winner = calculateMonthScores(model, month, nameForPlayer)[0];
      const row = byPlayer.get(winner?.playerId);
      if (row) { row.monthAwards++; row.months.push({ month, score: winner.score }); }
    }
  }
  return byPlayer;
}

// Names/IDs stabilize display only. Equal totals have equal competition ranks,
// including at the podium boundary: 1, 1, 3 (not an arbitrary winner).
export function rankAwardRows(rows, key) {
  if (!AWARD_SORT_KEYS.includes(key)) throw new TypeError('Unknown award ranking');
  let previous, rank = 0;
  return [...rows].sort((a,b) => b[key] - a[key] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((row,index) => {
      if (index === 0 || row[key] !== previous) rank = index + 1;
      previous = row[key];
      return { ...row, rank };
    });
}
