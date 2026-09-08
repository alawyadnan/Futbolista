import test from "node:test";
import assert from "node:assert/strict";
import { buildDataModel, emptyModel } from "../data-engine.js";
import { computePlayerProgress, computePlayerRecords } from "../insights-engine.js";

const players = [{ id: "a", name: "Ali" }, { id: "b", name: "Bader" }];

function appearance(index, result = "win", goals = 0, extra = {}) {
  return {
    id: `a-${index}`,
    playerId: "a",
    date: `2026-01-${String(index).padStart(2, "0")}`,
    result,
    side: "A",
    goals,
    ownGoal: false,
    ...extra
  };
}

test("progress compares two complete windows with percentage-point deltas", () => {
  const results = ["win", "loss", "draw", "loss", "loss", "win", "win", "win", "draw", "loss"];
  const model = buildDataModel(players, results.map((result, index) => appearance(index + 1, result, index < 5 ? 1 : 2)));
  const progress = computePlayerProgress(model, "a");

  assert.deepEqual(progress.previous, { matches: 5, wins: 1, draws: 1, losses: 3, goals: 5, winPct: 0.2, gpm: 1 });
  assert.deepEqual(progress.current, { matches: 5, wins: 3, draws: 1, losses: 1, goals: 10, winPct: 0.6, gpm: 2 });
  assert.equal(progress.canCompare, true);
  assert.deepEqual(progress.deltas, { wins: 2, goals: 5, gpm: 1, winPctPoints: 40 });
  assert.equal(progress.recentMatches.length, 10);
});

test("partial windows expose actual totals without claiming a comparison", () => {
  for (const count of [1, 4, 5, 7, 9]) {
    const model = buildDataModel(players, Array.from({ length: count }, (_, index) => appearance(index + 1, "win", 1)));
    const progress = computePlayerProgress(model, "a");
    assert.equal(progress.current.matches, Math.min(count, 5));
    assert.equal(progress.previous.matches, Math.max(0, count - 5));
    assert.equal(progress.canCompare, false);
    assert.equal(progress.deltas, null);
    assert.equal(progress.recentMatches.length, count);
  }
});

test("recent progress contains only the latest ten appearances in chronological order", () => {
  const logs = Array.from({ length: 12 }, (_, index) => appearance(index + 1, index % 2 ? "loss" : "win", index));
  const progress = computePlayerProgress(buildDataModel(players, [...logs].reverse()), "a");
  assert.deepEqual(progress.recentMatches[0], { matchKey: "2026-01-03", date: "2026-01-03", result: "win", goals: 2 });
  assert.deepEqual(progress.recentMatches.at(-1), { matchKey: "2026-01-12", date: "2026-01-12", result: "loss", goals: 11 });
  assert.equal(progress.previous.goals, 20);
  assert.equal(progress.current.goals, 45);
});

test("duplicate and own-goal documents never inflate progress or scoring records", () => {
  const normal = appearance(1, "win", 2);
  const model = buildDataModel(players, [
    normal,
    { ...normal, id: "duplicate" },
    { ...normal, id: "own-goals", ownGoal: true, goals: 4 },
    appearance(2, "draw", 3, { ownGoal: true })
  ]);
  const progress = computePlayerProgress(model, "a");
  const records = computePlayerRecords(model, "a");
  assert.equal(progress.current.matches, 2);
  assert.equal(progress.current.goals, 2);
  assert.deepEqual(progress.recentMatches.map(match => match.goals), [2, 0]);
  assert.deepEqual(records.bestScoringMatch, { goals: 2, latestMatchKey: "2026-01-01", date: "2026-01-01", ties: 1 });
  assert.equal(records.hatTricks, 0);
  assert.equal(records.scoringMatches, 1);
  assert.equal(records.scoringRate, 0.5);
});

test("scoring records count three-or-more goals and retain the latest tied best", () => {
  const model = buildDataModel(players, [2, 4, 3, 0, 4].map((goals, index) => appearance(index + 1, "win", goals)));
  const records = computePlayerRecords(model, "a");
  assert.deepEqual(records.bestScoringMatch, { goals: 4, latestMatchKey: "2026-01-05", date: "2026-01-05", ties: 2 });
  assert.equal(records.hatTricks, 3);
  assert.equal(records.scoringMatches, 4);
  assert.equal(records.scoringRate, 0.8);
});

test("a new personal best resets the count of earlier tied records", () => {
  const model = buildDataModel(players, [2, 2, 4, 3].map((goals, index) => appearance(index + 1, "win", goals)));
  assert.deepEqual(computePlayerRecords(model, "a").bestScoringMatch, {
    goals: 4, latestMatchKey: "2026-01-03", date: "2026-01-03", ties: 1
  });
});

test("unbeaten runs include draws and are reset by losses", () => {
  const results = ["win", "draw", "win", "loss", "draw", "win"];
  const model = buildDataModel(players, results.map((result, index) => appearance(index + 1, result)));
  assert.equal(computePlayerRecords(model, "a").unbeatenBest, 3);
  assert.equal(computePlayerRecords(model, "a").unbeatenCurrent, 2);
  const endingLoss = buildDataModel(players, [...results, "loss"].map((result, index) => appearance(index + 1, result)));
  assert.equal(computePlayerRecords(endingLoss, "a").unbeatenCurrent, 0);
});

test("same-day match order follows the data model for recent games and latest record", () => {
  const model = buildDataModel(players, [
    appearance(1, "loss", 3, { matchId: "a-evening", createdAt: 200 }),
    appearance(1, "win", 3, { matchId: "z-morning", createdAt: 100 })
  ]);
  assert.deepEqual(computePlayerProgress(model, "a").recentMatches.map(match => match.matchKey), ["z-morning", "a-evening"]);
  assert.equal(computePlayerRecords(model, "a").bestScoringMatch.latestMatchKey, "a-evening");
  assert.equal(computePlayerRecords(model, "a").unbeatenCurrent, 0);
});

test("all-zero scoring has no invented scoring record and zero comparison deltas", () => {
  const model = buildDataModel(players, Array.from({ length: 10 }, (_, index) => appearance(index + 1, "loss")));
  const records = computePlayerRecords(model, "a");
  assert.deepEqual(records, { bestScoringMatch: null, hatTricks: 0, scoringMatches: 0, scoringRate: 0, unbeatenCurrent: 0, unbeatenBest: 0 });
  assert.deepEqual(computePlayerProgress(model, "a").deltas, { wins: 0, goals: 0, gpm: 0, winPctPoints: 0 });
});

test("empty and unknown players return finite empty summaries", () => {
  for (const model of [emptyModel(), buildDataModel(players, [appearance(1)])]) {
    const progress = computePlayerProgress(model, "missing");
    assert.deepEqual(progress.current, { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, winPct: 0, gpm: 0 });
    assert.deepEqual(progress.previous, progress.current);
    assert.equal(progress.canCompare, false);
    assert.equal(progress.deltas, null);
    assert.deepEqual(progress.recentMatches, []);
    assert.deepEqual(computePlayerRecords(model, "missing"), {
      bestScoringMatch: null, hatTricks: 0, scoringMatches: 0, scoringRate: 0, unbeatenCurrent: 0, unbeatenBest: 0
    });
  }
});

test("custom windows support negative progress and invalid sizes fall back to five", () => {
  const model = buildDataModel(players, [appearance(1, "win", 3), appearance(2, "win", 1), appearance(3, "loss"), appearance(4, "draw")]);
  const progress = computePlayerProgress(model, "a", 2);
  assert.deepEqual(progress.deltas, { wins: -2, goals: -4, gpm: -2, winPctPoints: -100 });
  assert.equal(progress.windowSize, 2);
  for (const size of [0, -1, NaN, Infinity, "invalid"]) {
    assert.equal(computePlayerProgress(model, "a", size).windowSize, 5);
  }
});

test("insight calculation and returned objects cannot mutate the data model", () => {
  const model = buildDataModel(players, [appearance(1, "win", 3), appearance(2, "draw", 3)]);
  const before = structuredClone(model);
  const progress = computePlayerProgress(model, "a");
  const records = computePlayerRecords(model, "a");
  assert.deepEqual(model, before);
  progress.recentMatches[0].goals = 90;
  progress.current.goals = 90;
  records.bestScoringMatch.goals = 90;
  assert.deepEqual(model, before);
});
