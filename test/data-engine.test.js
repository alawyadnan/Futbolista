import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataModel,
  calculateMonthScores,
  computeHeadToHead,
  computeTeammates,
  emptyModel,
  isOwnGoal,
  matchKeyOf,
  normalizeResult
} from "../data-engine.js";

const players = [
  { id: "a", name: "Ali" },
  { id: "b", name: "Bader" },
  { id: "c", name: "Chris" }
];

function log(playerId, date, result = "win", side = "A", goals = 0, ownGoal = false, extra = {}) {
  return { id: `${playerId}-${date}-${ownGoal ? "own" : "normal"}`, playerId, date, result, side, goals, ownGoal, ...extra };
}

test("normal goal entry creates one appearance and counts personal goals", () => {
  const model = buildDataModel(players, [log("a", "2026-01-01", "win", "A", 2)]);
  assert.equal(model.stats.a.matches, 1);
  assert.equal(model.stats.a.goals, 2);
});

test("normal and own-goal rows merge into one participation", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "win", "A", 2),
    log("a", "2026-01-01", "win", "A", 1, true)
  ]);
  assert.equal(model.stats.a.matches, 1);
  assert.equal(model.stats.a.goals, 2);
  assert.deepEqual(model.forms.a.formResults, ["win"]);
  assert.equal(model.byPlayer.get("a")[0].ownGoals, 1);
});

test("identical normal duplicates do not inflate goals or appearances", () => {
  const duplicate = log("a", "2026-01-01", "win", "A", 2);
  const model = buildDataModel(players, [duplicate, { ...duplicate, id: "duplicate" }]);
  assert.equal(model.stats.a.matches, 1);
  assert.equal(model.stats.a.goals, 2);
  assert.equal(model.byPlayer.get("a")[0].rawCount, 2);
});

test("an extra own-goal document does not displace an actual match from last five", () => {
  const logs = ["01", "02", "03", "04", "05"].map(day => log("a", `2026-01-${day}`));
  logs.push(log("a", "2026-01-05", "win", "A", 1, true));
  const model = buildDataModel(players, logs);
  assert.equal(model.stats.a.matches, 5);
  assert.equal(model.forms.a.formResults.length, 5);
});

test("last five form is ordered oldest left and newest right", () => {
  const results = ["loss", "win", "draw", "win", "loss", "win"];
  const model = buildDataModel(players, results.map((result, index) => log("a", `2026-01-0${index + 1}`, result)));
  assert.deepEqual(model.forms.a.formResults, ["win", "draw", "win", "loss", "win"]);
  assert.equal(model.forms.a.formIcons, "🟢 🟡 🟢 🔴 🟢");
});

test("W W D W has best streak two and current streak one", () => {
  const model = buildDataModel(players, ["win", "win", "draw", "win"].map((result, index) => log("a", `2026-01-0${index + 1}`, result)));
  assert.equal(model.stats.a.best, 2);
  assert.equal(model.stats.a.current, 1);
});

test("W W L has best streak two and current streak zero", () => {
  const model = buildDataModel(players, ["win", "win", "loss"].map((result, index) => log("a", `2026-01-0${index + 1}`, result)));
  assert.equal(model.stats.a.best, 2);
  assert.equal(model.stats.a.current, 0);
});

test("own goal is awarded to the opposing team score", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "draw", "A", 3),
    log("a", "2026-01-01", "draw", "A", 1, true),
    log("b", "2026-01-01", "draw", "B", 2)
  ]);
  const match = model.matchSummaries.get("2026-01-01");
  assert.deepEqual([match.scoreA, match.scoreB], [3, 3]);
});

test("eligibility uses floor of half the system matches with minimum one", () => {
  for (const [total, appearances, expected] of [[6, 3, true], [7, 3, true], [8, 3, false], [8, 4, true]]) {
    const logs = [];
    for (let index = 1; index <= total; index += 1) logs.push(log(index <= appearances ? "a" : "b", `2026-01-${String(index).padStart(2, "0")}`));
    assert.equal(buildDataModel(players, logs).eligibleIds.has("a"), expected);
  }
});

test("head-to-head counts a match once despite duplicate raw entries", () => {
  const logs = [
    log("a", "2026-01-01", "win", "A", 2),
    { ...log("a", "2026-01-01", "win", "A", 2), id: "dup" },
    log("b", "2026-01-01", "loss", "B")
  ];
  assert.equal(computeHeadToHead(buildDataModel(players, logs), "a", "b").againstMatches, 1);
});

test("teammate count increments once for normal plus own-goal rows", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "win", "A", 2),
    log("a", "2026-01-01", "win", "A", 1, true),
    log("b", "2026-01-01", "win", "A")
  ]);
  assert.equal(computeTeammates(model, "a").b, 1);
});

test("monthly appearances count normal plus own-goal rows once", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "win", "A", 2),
    log("a", "2026-01-01", "win", "A", 1, true)
  ]);
  const row = calculateMonthScores(model, "2026-01", id => players.find(player => player.id === id).name)[0];
  assert.equal(row.matches, 1);
  assert.equal(row.goals, 2);
});

test("legacy results and future match ids remain backward compatible", () => {
  assert.equal(normalizeResult({ win: true }), "win");
  assert.equal(normalizeResult({ win: false }), "loss");
  assert.equal(matchKeyOf({ matchId: "match-7", date: "2026-01-01" }), "match-7");
  assert.equal(matchKeyOf({ date: "2026-01-01" }), "2026-01-01");
});

test("missing timestamps resolve conflicting metadata deterministically by document id", () => {
  const logs = [
    log("a", "2026-01-01", "win", "A", 0, false, { id: "a" }),
    log("a", "2026-01-01", "loss", "B", 0, false, { id: "z" })
  ];
  const forward = buildDataModel(players, logs).byPlayer.get("a")[0];
  const reverse = buildDataModel(players, [...logs].reverse()).byPlayer.get("a")[0];
  assert.deepEqual({ result: forward.result, side: forward.side }, { result: reverse.result, side: reverse.side });
  assert.equal(forward.conflicts.length, 1);
});

test("malformed rows are skipped without crashing valid historical data", () => {
  const model = buildDataModel(players, [
    { id: "bad", playerId: "a", goals: "oops" },
    { id: "legacy", playerId: "a", date: "2026-01-01", win: true, goals: "2" }
  ]);
  assert.equal(model.stats.a.matches, 1);
  assert.equal(model.stats.a.wins, 1);
  assert.equal(model.stats.a.goals, 2);
});

test("distinct future match ids keep two same-day matches separate", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "win", "A", 1, false, { matchId: "morning" }),
    log("a", "2026-01-01", "loss", "B", 2, false, { matchId: "evening" })
  ]);
  assert.equal(model.totalMatches, 2);
  assert.equal(model.stats.a.matches, 2);
  assert.equal(model.stats.a.goals, 3);
});

test("same-day matches use creation time for form and streak order", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "loss", "A", 0, false, { matchId: "z-morning", createdAt: 100 }),
    log("a", "2026-01-01", "win", "A", 0, false, { matchId: "a-evening", createdAt: 200 })
  ]);
  assert.deepEqual(model.forms.a.formResults, ["loss", "win"]);
  assert.equal(model.stats.a.current, 1);
});

test("own-goal flags remain strict booleans for legacy compatibility", () => {
  assert.equal(isOwnGoal({ ownGoal: true }), true);
  assert.equal(isOwnGoal({ ownGoal: false }), false);
  assert.equal(isOwnGoal({ ownGoal: "true" }), false);
  assert.equal(isOwnGoal({}), false);
});

test("own goals from both teams are credited only to the opposing score", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "draw", "A", 2),
    log("a", "2026-01-01", "draw", "A", 1, true),
    log("b", "2026-01-01", "draw", "B", 4),
    log("b", "2026-01-01", "draw", "B", 2, true)
  ]);
  const match = model.matchSummaries.get("2026-01-01");
  assert.deepEqual([match.scoreA, match.scoreB], [4, 5]);
  assert.deepEqual([model.stats.a.goals, model.stats.b.goals], [2, 4]);
});

test("head-to-head separates matches together from matches against", () => {
  const model = buildDataModel(players, [
    log("a", "2026-01-01", "win", "A"),
    log("b", "2026-01-01", "win", "A"),
    log("a", "2026-01-02", "draw", "A"),
    log("b", "2026-01-02", "draw", "A"),
    log("a", "2026-01-03", "win", "A"),
    log("b", "2026-01-03", "loss", "B")
  ]);
  assert.deepEqual(computeHeadToHead(model, "a", "b"), {
    againstMatches: 1,
    aWinsAgainst: 1,
    bWinsAgainst: 0,
    drawsAgainst: 0,
    togetherMatches: 2,
    togetherWins: 1,
    togetherLosses: 0,
    togetherDraws: 1
  });
});

test("head-to-head covers player B wins, opposing draws, and losses together", () => {
  const model = buildDataModel(players, [
    log("a", "2026-02-01", "loss", "A"),
    log("b", "2026-02-01", "win", "B"),
    log("a", "2026-02-02", "draw", "A"),
    log("b", "2026-02-02", "draw", "B"),
    log("a", "2026-02-03", "loss", "A"),
    log("b", "2026-02-03", "loss", "A")
  ]);
  assert.deepEqual(computeHeadToHead(model, "a", "b"), {
    againstMatches: 2,
    aWinsAgainst: 0,
    bWinsAgainst: 1,
    drawsAgainst: 1,
    togetherMatches: 1,
    togetherWins: 0,
    togetherLosses: 1,
    togetherDraws: 0
  });
});

test("goal values are safely clamped before aggregation", () => {
  const model = buildDataModel(players, [
    log("a", "2026-03-01", "win", "A", -4),
    log("a", "2026-03-02", "win", "A", 2.9),
    log("a", "2026-03-03", "win", "A", 500),
    log("a", "2026-03-04", "win", "A", "not-a-number")
  ]);
  assert.equal(model.stats.a.goals, 101);
});

test("monthly rows preserve draw and loss totals", () => {
  const model = buildDataModel(players, [
    log("a", "2026-04-01", "draw", "A", 1),
    log("a", "2026-04-02", "loss", "A", 0)
  ]);
  const row = calculateMonthScores(model, "2026-04", id => id).find(item => item.playerId === "a");
  assert.deepEqual({ matches: row.matches, wins: row.wins, draws: row.draws, losses: row.losses }, {
    matches: 2,
    wins: 0,
    draws: 1,
    losses: 1
  });
});

test("empty model exposes every collection used by the UI", () => {
  const model = emptyModel();
  assert.equal(model.totalMatches, 0);
  assert.equal(model.playerById.size, 0);
  assert.equal(model.participationsByMonth.size, 0);
});

test("monthly score is capped at ten without mutating season totals", () => {
  const logs = Array.from({ length: 12 }, (_value, index) =>
    log("a", `2026-01-${String(index + 1).padStart(2, "0")}`, "win", "A", 20)
  );
  const model = buildDataModel(players, logs);
  const monthly = calculateMonthScores(model, "2026-01", id => id).find(row => row.playerId === "a");
  assert.equal(monthly.score, 10);
  assert.equal(model.stats.a.matches, 12);
  assert.equal(model.stats.a.goals, 240);
});
