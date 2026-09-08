export const VOTING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const VOTE_POINTS = Object.freeze([5, 3, 1]);
export const CHOICE_FIELDS = Object.freeze(['firstPlayerId', 'secondPlayerId', 'thirdPlayerId']);

export function validateProfile(input) {
  if (!input || Object.keys(input).some(key => !['displayName', 'preferredNumber'].includes(key))) return { error: 'invalidProfile' };
  const displayName = typeof input.displayName === 'string' ? input.displayName.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
  if (!displayName || displayName.length > 40 || /[<>\p{Cc}\p{Cf}]/u.test(displayName)) return { error: 'invalidDisplayName' };
  const preferredNumber = input.preferredNumber;
  if (preferredNumber !== null && (!Number.isInteger(preferredNumber) || preferredNumber < 0 || preferredNumber > 99)) return { error: 'invalidNumber' };
  return { value: { displayName, preferredNumber } };
}

export function sessionDocumentId(matchKey) {
  if (typeof matchKey !== 'string' || !matchKey.trim()) throw new Error('invalidSession');
  return encodeURIComponent(matchKey.trim());
}

export function sessionCandidates(model, matchKey) {
  const ids = new Set((model?.byMatch?.get(String(matchKey)) || []).map(part => part.playerId));
  return [...ids].filter(id => model.playerById.has(id)).sort();
}

// First entry starts the window; later entries only add candidates. Never open
// voting retroactively merely because an old match has no community document.
export function planEntryVoting(model, entry, session = null, now = Date.now()) {
  const matchKey = String(entry?.matchId || entry?.date || '').trim();
  const playerId = String(entry?.playerId || '').trim();
  if (!matchKey || !model?.playerById?.has(playerId)) throw new Error('invalidCandidate');
  if (!session) {
    return model.byMatch.has(matchKey) ? { type: 'none' } : {
      type: 'create', value: { matchKey, date: entry.date, candidatePlayerIds: [playerId] }
    };
  }
  if (votingState(session, now).state !== 'open') return { type: 'none' };
  const candidatePlayerIds = [...new Set([
    ...session.candidatePlayerIds, ...sessionCandidates(model, matchKey), playerId
  ])].sort();
  if (candidatePlayerIds.length > 100) throw new Error('sessionTooLarge');
  return candidatePlayerIds.length === session.candidatePlayerIds.length
    ? { type: 'none' } : { type: 'append', value: { candidatePlayerIds } };
}

export function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// The opening timestamp comes from Firestore serverTimestamp(). Rules enforce the
// exact same 24-hour duration using request.time; the browser clock is UI only.
export function votingState(session, now = Date.now()) {
  const openedAt = timestampMillis(session?.openedAt);
  if (openedAt === null) return { state: 'pending', remaining: 0, closesAt: null };
  const closesAt = openedAt + VOTING_WINDOW_MS;
  return { state: now < openedAt ? 'pending' : now < closesAt ? 'open' : 'closed', remaining: Math.max(0, closesAt - now), closesAt };
}

export function validateBallot({ session, user, choices, now = Date.now() }) {
  if (!user?.playerId) return 'linkedRequired';
  if (votingState(session, now).state !== 'open') return 'votingClosed';
  if (session.candidatePlayerIds.length < 4) return 'sessionTooSmall';
  if (!Array.isArray(choices) || choices.length !== 3 || choices.some(id => typeof id !== 'string' || !id)) return 'chooseThree';
  if (new Set(choices).size !== 3) return 'uniqueChoices';
  if (choices.includes(user.playerId)) return 'noSelfVote';
  if (choices.some(id => !session.candidatePlayerIds.includes(id))) return 'invalidCandidate';
  return null;
}

export function ballotChoices(ballot) { return CHOICE_FIELDS.map(key => ballot?.[key] || ''); }

// No client-supplied points or names are read. UID is the deterministic doc ID.
// Even malformed imported ballots cannot inflate the tally or create extra ranks.
export function tallyBallots(session, ballots, now = Date.now()) {
  if (votingState(session, now).state !== 'closed') return null;
  const rows = new Map((session.candidatePlayerIds || []).map(playerId => [playerId, { playerId, points: 0, first: 0, second: 0, third: 0 }]));
  const seenUids = new Set();
  let totalBallots = 0;
  for (const ballot of ballots) {
    const choices = ballotChoices(ballot);
    if (!ballot.uid || seenUids.has(ballot.uid) || !ballot.voterPlayerId || new Set(choices).size !== 3
      || choices.includes(ballot.voterPlayerId) || choices.some(id => !rows.has(id))) continue;
    seenUids.add(ballot.uid);
    totalBallots++;
    choices.forEach((id, rank) => { const row = rows.get(id); row.points += VOTE_POINTS[rank]; row[['first', 'second', 'third'][rank]]++; });
  }
  const ranking = [...rows.values()].sort((a, b) => b.points - a.points || b.first - a.first || b.second - a.second || b.third - a.third || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  return { totalBallots, ranking };
}

export function resolvePublicPlayers(players, profiles = new Map()) {
  return players.map(player => {
    const profile = profiles.get(String(player.id));
    const valid = profile && validateProfile({ displayName: profile.displayName, preferredNumber: profile.preferredNumber });
    return valid?.value ? { ...player, name: valid.value.displayName, preferredNumber: valid.value.preferredNumber } : { ...player };
  });
}
