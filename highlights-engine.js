import { votingState, timestampMillis } from './community-engine.js?v=500405';

// A technical ID orders equal rows for display, but must never decide an award.
export function motmWinners(result) {
  const first = result?.ranking?.[0];
  if (!result?.totalBallots || !(first?.points > 0)) return [];
  return result.ranking.filter(row => ['points', 'first', 'second', 'third'].every(key => row[key] === first[key])).map(row => row.playerId);
}

export function awardPodium(result) {
  let previous = null, rank = 0;
  return (result?.ranking || []).filter(row => row.points > 0).map((row,index) => {
    if (!previous || ['points','first','second','third'].some(key => row[key] !== previous[key])) rank = index + 1;
    previous = row;
    return { ...row, rank };
  }).filter(row => row.rank <= 3);
}

export function summarizeAwards(sessions = [], results = new Map(), now = Date.now()) {
  // Do not count an imported duplicate session as a second award. Prefer the
  // canonical document ID; legacy duplicates use a stable earliest opening.
  const byKey = new Map();
  for (const session of [...sessions].sort((a,b) => (timestampMillis(a.openedAt) || 0) - (timestampMillis(b.openedAt) || 0) || a.id.localeCompare(b.id))) {
    if (typeof session.matchKey !== 'string' || !session.matchKey.trim()) continue;
    const old = byKey.get(session.matchKey);
    if (!old || session.id === encodeURIComponent(session.matchKey.trim())) byKey.set(session.matchKey,session);
  }
  const known = [...byKey.values()];
  const closed = known.filter(session => votingState(session, now).state === 'closed')
    .sort((a,b) => String(a.date).localeCompare(String(b.date)) || timestampMillis(a.openedAt) - timestampMillis(b.openedAt) || a.id.localeCompare(b.id));
  const byMatch = new Map(), byPlayer = new Map();
  let loaded = 0;
  for (const session of closed) {
    const result = results.get(session.id);
    // A failed or pending read is unknown, not a zero-vote result.
    if (!result) continue;
    loaded++;
    const award = { session, result, winnerIds: motmWinners(result) };
    byMatch.set(session.matchKey, award);
    for (const id of award.winnerIds) {
      if (!byPlayer.has(id)) byPlayer.set(id, []);
      byPlayer.get(id).push(award);
    }
  }
  return { byMatch, byPlayer, closed, loaded, complete: loaded === closed.length, latest: closed.at(-1) || null,
    pendingKeys: new Set(known.filter(session => votingState(session,now).state !== 'closed').map(session => session.matchKey)) };
}

export const TREND_RULES = Object.freeze({
  wins: { min: 3, strong: 5, tone: 'positive', priority: 4 },
  unbeaten: { min: 5, strong: 10, tone: 'positive', priority: 3 },
  losses: { min: 4, strong: 6, tone: 'caution', priority: 1 },
  winless: { min: 5, strong: 8, tone: 'caution', priority: 1 },
  scoring: { min: 6, strong: 8, tone: 'positive', priority: 3 },
  attendance: { min: 10, strong: 15, tone: 'positive', priority: 2 },
  motm: { min: 2, strong: 3, tone: 'gold', priority: 5 }
});

export function trendDocumentId(trend) {
  return encodeURIComponent(JSON.stringify([trend.playerId, trend.type, trend.startMatchKey]));
}

function suffix(rows, predicate) {
  let start = rows.length;
  while (start && predicate(rows[start - 1])) start--;
  return rows.slice(start);
}

export function computeTrends(model, awards = summarizeAwards()) {
  const matches = [...(model?.matchSummaries?.values() || [])]
    .sort((a,b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.matchKey.localeCompare(b.matchKey));
  const latest = matches.at(-1);
  const order = new Map(matches.map((match,index) => [match.matchKey,index]));
  const trends = [];
  for (const player of model?.playerById?.values() || []) {
    const playerId = String(player.id);
    const parts = [...(model.byPlayer.get(playerId) || [])].sort((a,b) => order.get(a.matchKey) - order.get(b.matchKey));
    const reliable = part => !part.conflicts?.length;
    const runs = {
      wins: suffix(parts, p => reliable(p) && p.result === 'win'),
      unbeaten: suffix(parts, p => reliable(p) && ['win','draw'].includes(p.result)),
      losses: suffix(parts, p => reliable(p) && p.result === 'loss'),
      winless: suffix(parts, p => reliable(p) && ['loss','draw'].includes(p.result)),
      scoring: suffix(parts, p => reliable(p) && p.normalGoals > 0),
      attendance: suffix(matches, match => match.parts.some(p => p.playerId === playerId))
    };
    // An ongoing vote has no winner yet. Missing/failed/zero-vote final results
    // break the chain; a win on either side of a gap is not consecutive MOTM.
    const eligible = [...parts];
    while (eligible.length && awards.pendingKeys.has(eligible.at(-1).matchKey)) eligible.pop();
    runs.motm = suffix(eligible, part => awards.byMatch.get(part.matchKey)?.winnerIds.includes(playerId));
    for (const [type, run] of Object.entries(runs)) {
      const rule = TREND_RULES[type];
      if (run.length < rule.min) continue;
      const start = run[0], end = run.at(-1);
      const trend = { playerId, type, count: run.length, startMatchKey: start.matchKey, endMatchKey: end.matchKey,
        startDate: start.date, endDate: end.date, tone: rule.tone,
        strong: run.length >= rule.strong, current: end.matchKey === latest?.matchKey,
        score: run.length / rule.strong + rule.priority / 10 };
      // MOTM may end at the latest closed vote while today's vote is still open.
      if (type === 'motm') trend.current = end.matchKey === awards.latest?.matchKey && parts.at(-1)?.matchKey === latest?.matchKey;
      trend.id = trendDocumentId(trend);
      trends.push(trend);
    }
  }
  return trends;
}

export function selectHeadlineTrends(trends, hiddenIds = new Set(), limit = 3) {
  const seen = new Set(), types = new Set(), selected = [];
  let cautions = 0;
  const rows = trends.filter(trend => trend.strong && trend.current && !suppressed(trend,trends,hiddenIds))
    .sort((a,b) => b.score - a.score || a.playerId.localeCompare(b.playerId) || a.type.localeCompare(b.type));
  // Prefer different facts, not three versions of the same winning run.
  for (const diverse of [true,false]) for (const row of rows) {
    if (selected.length >= limit || seen.has(row.playerId) || (diverse && types.has(row.type)) || (row.tone === 'caution' && cautions)) continue;
    selected.push(row); seen.add(row.playerId); types.add(row.type);
    if (row.tone === 'caution') cautions++;
  }
  return selected;
}

export function selectProfileTrends(trends, playerId, hiddenIds = new Set()) {
  const rows = trends.filter(trend => trend.playerId === playerId && !suppressed(trend,trends,hiddenIds));
  // A win run is already unbeaten; avoid saying the same thing twice.
  return rows.filter(row => !((row.type === 'unbeaten' && rows.some(other => other.type === 'wins' && other.count === row.count))
    || (row.type === 'winless' && rows.some(other => other.type === 'losses' && other.count === row.count))))
    .sort((a,b) => b.score - a.score || a.type.localeCompare(b.type));
}

function suppressed(trend, trends, hiddenIds) {
  if (hiddenIds.has(trend.id)) return true;
  const related = { wins:'unbeaten', unbeaten:'wins', losses:'winless', winless:'losses' }[trend.type];
  return !!related && trends.some(other => other.playerId === trend.playerId && other.type === related
    && other.startMatchKey === trend.startMatchKey && other.endMatchKey === trend.endMatchKey && hiddenIds.has(other.id));
}
