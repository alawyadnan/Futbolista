function playerParticipations(model, playerId) {
  return model?.byPlayer?.get(String(playerId ?? "").trim()) || [];
}

function summarizeWindow(participations) {
  const summary = { matches: participations.length, wins: 0, draws: 0, losses: 0, goals: 0, winPct: 0, gpm: 0 };
  for (const participation of participations) {
    summary.goals += participation.normalGoals;
    if (participation.result === "win") summary.wins += 1;
    else if (participation.result === "draw") summary.draws += 1;
    else summary.losses += 1;
  }
  if (summary.matches) {
    summary.winPct = summary.wins / summary.matches;
    summary.gpm = summary.goals / summary.matches;
  }
  return summary;
}

// The data model supplies deduplicated participations in chronological order.
export function computePlayerProgress(model, playerId, windowSize = 5) {
  const requestedSize = Math.floor(Number(windowSize));
  const size = Number.isSafeInteger(requestedSize) && requestedSize > 0 ? requestedSize : 5;
  const participations = playerParticipations(model, playerId);
  const currentStart = Math.max(0, participations.length - size);
  const previousStart = Math.max(0, currentStart - size);
  const current = summarizeWindow(participations.slice(currentStart));
  const previous = summarizeWindow(participations.slice(previousStart, currentStart));
  const canCompare = current.matches === size && previous.matches === size;

  return {
    windowSize: size,
    current,
    previous,
    canCompare,
    deltas: canCompare ? {
      wins: current.wins - previous.wins,
      goals: current.goals - previous.goals,
      gpm: current.gpm - previous.gpm,
      winPctPoints: (current.wins - previous.wins) / size * 100
    } : null,
    recentMatches: participations.slice(-10).map(participation => ({
      matchKey: participation.matchKey,
      date: participation.date,
      result: participation.result,
      goals: participation.normalGoals
    }))
  };
}

export function computePlayerRecords(model, playerId) {
  const participations = playerParticipations(model, playerId);
  const records = {
    bestScoringMatch: null,
    hatTricks: 0,
    scoringMatches: 0,
    scoringRate: 0,
    unbeatenCurrent: 0,
    unbeatenBest: 0
  };

  for (const participation of participations) {
    const goals = participation.normalGoals;
    if (goals > 0) {
      records.scoringMatches += 1;
      const best = records.bestScoringMatch;
      if (!best || goals > best.goals) {
        records.bestScoringMatch = { goals, latestMatchKey: participation.matchKey, date: participation.date, ties: 1 };
      } else if (goals === best.goals) {
        best.latestMatchKey = participation.matchKey;
        best.date = participation.date;
        best.ties += 1;
      }
    }
    if (goals >= 3) records.hatTricks += 1;

    if (participation.result === "win" || participation.result === "draw") {
      records.unbeatenCurrent += 1;
      records.unbeatenBest = Math.max(records.unbeatenBest, records.unbeatenCurrent);
    } else {
      records.unbeatenCurrent = 0;
    }
  }

  records.scoringRate = participations.length ? records.scoringMatches / participations.length : 0;
  return records;
}
