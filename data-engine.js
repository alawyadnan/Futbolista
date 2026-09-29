const VALID_RESULTS = new Set(["win", "draw", "loss"]);
const VALID_SIDES = new Set(["A", "B"]);

export function normalizeResult(log) {
  if (VALID_RESULTS.has(log?.result)) return log.result;
  if (typeof log?.win === "boolean") return log.win ? "win" : "loss";
  return "loss";
}

export function normalizeSide(log) {
  if (VALID_SIDES.has(log?.side)) return log.side;
  const result = normalizeResult(log);
  return result === "loss" ? "B" : "A";
}

export function isOwnGoal(log) {
  return log?.ownGoal === true;
}

export function matchKeyOf(log) {
  return String(log?.matchId || "").trim() || String(log?.date || "").trim();
}

function safeGoals(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, Math.min(99, number)) : 0;
}

function timestampOf(log) {
  const value = Number(log?.createdAt);
  return Number.isFinite(value) ? value : 0;
}

function compareRawOldestFirst(a, b) {
  return String(a?.date || "").localeCompare(String(b?.date || ""))
    || timestampOf(a) - timestampOf(b)
    || String(a?.id || "").localeCompare(String(b?.id || ""));
}

function compareParticipationsOldestFirst(a, b) {
  return a.date.localeCompare(b.date)
    || a.createdAt - b.createdAt
    || a.matchKey.localeCompare(b.matchKey)
    || a.playerId.localeCompare(b.playerId);
}

export function emptyStats() {
  return { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, winPct: 0, gpm: 0, current: 0, best: 0 };
}

export function emptyModel() {
  return {
    participations: [], byPlayer: new Map(), byMatch: new Map(), matchSummaries: new Map(),
    playerById: new Map(), stats: {}, forms: {}, participationsByMonth: new Map(),
    totalMatches: 0, minEligibleMatches: 1, eligibleIds: new Set()
  };
}

function metadataRank(log) {
  return `${String(timestampOf(log)).padStart(20, "0")}::${String(log?.id || "")}`;
}

export function isGoalAddition(log) {
  return Object.prototype.hasOwnProperty.call(log || {}, 'goalAddition');
}

export function goalAdditionSide(log) {
  return isGoalAddition(log) && VALID_SIDES.has(log.goalAddition?.side)
    && Number.isInteger(log.goals) && log.goals > 0 && log.goals <= 99
    ? log.goalAddition.side : null;
}

// Additional goals never create an appearance or supply result/team metadata.
export function prepareGoalAddition(model, rawLogs, { matchKey, playerId, goals, side, ownGoal = false }) {
  if (!VALID_SIDES.has(side)) throw new Error('chooseGoalTeam');
  if (String(goals ?? '').trim() === '' || !Number.isInteger(Number(goals)) || Number(goals) < 1 || Number(goals) > 99) throw new Error('invalidAdditionalGoals');
  const part = model.byMatch.get(String(matchKey))?.find(row => row.playerId === String(playerId));
  if (!part || !model.playerById.has(String(playerId))) throw new Error('additionalNeedsAppearance');
  const source = rawLogs.filter(log => !isGoalAddition(log) && log.id && String(log.playerId) === part.playerId && matchKeyOf(log) === part.matchKey)
    .sort((a, b) => metadataRank(b).localeCompare(metadataRank(a)))[0];
  if (!source) throw new Error('additionalNeedsAppearance');
  const entry = { playerId: part.playerId, date: part.date, goals: Number(goals), ownGoal: ownGoal === true,
    side: part.side, result: part.result, goalAddition: { side } };
  if (part.matchKey !== part.date) entry.matchId = part.matchKey;
  return { sourceId: String(source.id), entry };
}

// Checked again against server-read documents inside the save transaction.
export function validateGoalAdditionSave(source, entry, existing = null) {
  if (!source || isGoalAddition(source) || !goalAdditionSide(entry)
    || String(source.playerId) !== entry.playerId || matchKeyOf(source) !== matchKeyOf(entry)
    || normalizeSide(source) !== entry.side || normalizeResult(source) !== entry.result) throw new Error('additionalNeedsAppearance');
  if (!existing) return 'create';
  const fields = ['playerId', 'date', 'matchId', 'side', 'result', 'goals', 'ownGoal', 'createdAt'];
  if (goalAdditionSide(existing) === goalAdditionSide(entry) && fields.every(key => existing[key] === entry[key])) return 'saved';
  throw new Error('additionalSaveConflict');
}

function matchScorers(parts, side) {
  return parts.flatMap(part => {
    const extras = part.additionalGoalsBySide;
    if (!extras) return part.side === side ? [part] : [];
    const assigned = part.side === side;
    const normalGoals = (assigned ? part.normalGoals - extras.A.normalGoals - extras.B.normalGoals : 0) + extras[side].normalGoals;
    const ownGoals = (assigned ? part.ownGoals - extras.A.ownGoals - extras.B.ownGoals : 0) + extras[side].ownGoals;
    return assigned || normalGoals || ownGoals ? [{ ...part, normalGoals, ownGoals, goalsOnly: !assigned }] : [];
  });
}

export function buildDataModel(players = [], rawLogs = []) {
  const participationMap = new Map();
  const orderedLogs = [...rawLogs].sort(compareRawOldestFirst);

  for (const log of orderedLogs) {
    if (isGoalAddition(log)) continue;
    const playerId = String(log?.playerId || "").trim();
    const date = String(log?.date || "").trim();
    const matchKey = matchKeyOf(log);
    if (!playerId || !date || !matchKey) continue;

    const key = `${matchKey}::${playerId}`;
    let participation = participationMap.get(key);
    if (!participation) {
      participation = {
        playerId, date, matchKey, result: normalizeResult(log), side: normalizeSide(log),
        normalGoals: 0, ownGoals: 0, createdAt: timestampOf(log), rawCount: 0,
        metadataRank: "", conflicts: []
      };
      participationMap.set(key, participation);
    }

    const goals = safeGoals(log?.goals);
    const goalField = isOwnGoal(log) ? "ownGoals" : "normalGoals";
    participation[goalField] = Math.max(participation[goalField], goals);
    participation.rawCount += 1;

    const result = normalizeResult(log);
    const side = normalizeSide(log);
    if (participation.rawCount > 1 && (participation.result !== result || participation.side !== side)) {
      participation.conflicts.push({ id: String(log?.id || ""), result, side });
    }

    const rank = metadataRank(log);
    if (rank >= participation.metadataRank) {
      participation.metadataRank = rank;
      participation.createdAt = timestampOf(log);
      participation.result = result;
      participation.side = side;
    }
  }

  // Deduplicate by Firestore document identity, not amount. Two intentionally
  // separate additions can have the same amount; replaying one cannot double it.
  const additions = new Map();
  for (const log of orderedLogs) {
    if (log?.id && goalAdditionSide(log)) additions.set(String(log.id), log);
  }
  for (const log of additions.values()) {
    const part = participationMap.get(`${matchKeyOf(log)}::${String(log.playerId || '').trim()}`);
    if (!part) continue;
    const field = isOwnGoal(log) ? 'ownGoals' : 'normalGoals';
    part.additionalGoalsBySide ||= { A: { normalGoals: 0, ownGoals: 0 }, B: { normalGoals: 0, ownGoals: 0 } };
    part.additionalGoalsBySide[goalAdditionSide(log)][field] += log.goals;
    part[field] += log.goals;
    part.rawCount++;
  }

  const participations = [...participationMap.values()]
    .map(({ metadataRank: _metadataRank, ...participation }) => participation)
    .sort(compareParticipationsOldestFirst);
  const byPlayer = new Map(players.map(player => [String(player.id), []]));
  const byMatch = new Map();
  const participationsByMonth = new Map();

  for (const participation of participations) {
    if (!byPlayer.has(participation.playerId)) byPlayer.set(participation.playerId, []);
    byPlayer.get(participation.playerId).push(participation);
    if (!byMatch.has(participation.matchKey)) byMatch.set(participation.matchKey, []);
    byMatch.get(participation.matchKey).push(participation);
    const month = participation.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      if (!participationsByMonth.has(month)) participationsByMonth.set(month, []);
      participationsByMonth.get(month).push(participation);
    }
  }

  const matchSummaries = new Map();
  for (const [matchKey, parts] of byMatch) {
    const teamA = parts.filter(part => part.side === "A");
    const teamB = parts.filter(part => part.side === "B");
    const scorersA = matchScorers(parts, 'A'), scorersB = matchScorers(parts, 'B');
    const sum = (entries, field) => entries.reduce((total, entry) => total + entry[field], 0);
    matchSummaries.set(matchKey, {
      matchKey,
      date: parts.reduce((latest, part) => part.date > latest ? part.date : latest, ""),
      createdAt: parts.reduce((latest, part) => Math.max(latest, part.createdAt || 0), 0),
      parts, teamA, teamB, scorersA, scorersB,
      scoreA: sum(scorersA, "normalGoals") + sum(scorersB, "ownGoals"),
      scoreB: sum(scorersB, "normalGoals") + sum(scorersA, "ownGoals")
    });
  }

  const stats = {};
  const forms = {};
  for (const player of players) {
    const playerId = String(player.id);
    const matches = byPlayer.get(playerId) || [];
    const stat = emptyStats();
    let streak = 0;
    for (const participation of matches) {
      stat.goals += participation.normalGoals;
      if (participation.result === "win") {
        stat.wins += 1;
        streak += 1;
        stat.best = Math.max(stat.best, streak);
      } else {
        participation.result === "draw" ? stat.draws += 1 : stat.losses += 1;
        streak = 0;
      }
    }
    stat.matches = matches.length;
    for (let index = matches.length - 1; index >= 0 && matches[index].result === "win"; index -= 1) stat.current += 1;
    stat.winPct = stat.matches ? stat.wins / stat.matches : 0;
    stat.gpm = stat.matches ? stat.goals / stat.matches : 0;
    stats[playerId] = stat;

    const last5 = matches.slice(-5);
    forms[playerId] = {
      formPoints: last5.reduce((points, match) => points + (match.result === "win" ? 1 : match.result === "draw" ? 0.5 : 0), 0),
      formResults: last5.map(match => match.result),
      formIcons: last5.map(match => match.result === "win" ? "🟢" : match.result === "draw" ? "🟡" : "🔴").join(" "),
      totalPlayerMatches: stat.matches
    };
  }

  const totalMatches = byMatch.size;
  const minEligibleMatches = Math.max(1, Math.floor(totalMatches / 2));
  const eligibleIds = new Set(players
    .filter(player => (stats[String(player.id)]?.matches || 0) >= minEligibleMatches)
    .map(player => String(player.id)));

  return {
    participations, byPlayer, byMatch, matchSummaries,
    playerById: new Map(players.map(player => [String(player.id), player])),
    stats, forms, participationsByMonth, totalMatches, minEligibleMatches, eligibleIds
  };
}

export function computeTeammates(model, playerId) {
  const counts = {};
  const id = String(playerId);
  for (const participation of model.byPlayer.get(id) || []) {
    for (const teammate of model.byMatch.get(participation.matchKey) || []) {
      if (teammate.playerId !== id && teammate.side === participation.side) {
        counts[teammate.playerId] = (counts[teammate.playerId] || 0) + 1;
      }
    }
  }
  return counts;
}

export function computeHeadToHead(model, playerAId, playerBId) {
  const result = {
    againstMatches: 0, aWinsAgainst: 0, bWinsAgainst: 0, drawsAgainst: 0,
    togetherMatches: 0, togetherWins: 0, togetherLosses: 0, togetherDraws: 0
  };
  const aId = String(playerAId);
  const bId = String(playerBId);
  for (const aEntry of model.byPlayer.get(aId) || []) {
    const bEntry = (model.byMatch.get(aEntry.matchKey) || []).find(entry => entry.playerId === bId);
    if (!bEntry) continue;
    if (aEntry.side !== bEntry.side) {
      result.againstMatches += 1;
      if (aEntry.result === "win" && bEntry.result === "loss") result.aWinsAgainst += 1;
      else if (bEntry.result === "win" && aEntry.result === "loss") result.bWinsAgainst += 1;
      else result.drawsAgainst += 1;
    } else {
      result.togetherMatches += 1;
      if (aEntry.result === "win" && bEntry.result === "win") result.togetherWins += 1;
      else if (aEntry.result === "draw" && bEntry.result === "draw") result.togetherDraws += 1;
      else result.togetherLosses += 1;
    }
  }
  return result;
}

export function calculateMonthScores(model, monthKey, nameForPlayer = id => id) {
  const rows = new Map();
  for (const part of model.participationsByMonth?.get(monthKey) || []) {
    if (!model.eligibleIds.has(part.playerId)) continue;
    if (!rows.has(part.playerId)) {
      rows.set(part.playerId, { playerId: part.playerId, name: nameForPlayer(part.playerId), matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, rawScore: 0, score: 0 });
    }
    const row = rows.get(part.playerId);
    const match = model.matchSummaries.get(part.matchKey);
    row.matches += 1;
    row.goals += part.normalGoals;
    row.rawScore += 0.5 + part.normalGoals * 0.1;
    if (part.result === "win") { row.wins += 1; row.rawScore += 1; }
    else if (part.result === "draw") { row.draws += 1; row.rawScore += 0.5; }
    else { row.losses += 1; row.rawScore -= 0.5; }
    if (match) {
      const teamGoals = part.side === "A" ? match.scoreA : match.scoreB;
      const conceded = part.side === "A" ? match.scoreB : match.scoreA;
      row.rawScore += teamGoals >= 10 ? 0.5 : teamGoals >= 5 ? 0.2 : 0;
      row.rawScore += conceded <= 3 ? 0.8 : conceded < 5 ? 0.5 : 0;
    }
  }
  return [...rows.values()]
    .map(row => ({ ...row, score: Math.min(10, Math.round((row.rawScore + Number.EPSILON) * 10) / 10) }))
    .sort((a, b) => b.score - a.score || b.matches - a.matches || b.wins - a.wins || b.goals - a.goals || a.name.localeCompare(b.name));
}
