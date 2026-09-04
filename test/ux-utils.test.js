import test from "node:test";
import assert from "node:assert/strict";
import { countText, directionFor, translate } from "../i18n.js";
import { buildHistoryPeriods, compareMetricValues, filterAndSortPlayers, filterMatches, isResetConfirmation, selectDisplayMonth } from "../ux-utils.js";

test("month fallback prefers the current month when it has eligible data", () => {
  assert.equal(selectDisplayMonth("2026-09", ["2026-08", "2026-09"]), "2026-09");
});

test("month fallback selects the latest completed available month", () => {
  assert.equal(selectDisplayMonth("2026-09", ["2026-06", "2026-08"]), "2026-08");
});

test("player directory search and numeric sorting are deterministic", () => {
  const players = [{ id: "a", name: "Ali" }, { id: "b", name: "Bader" }, { id: "c", name: "Alia" }];
  const stats = { a: { matches: 2, goals: 3 }, b: { matches: 9, goals: 1 }, c: { matches: 4, goals: 5 } };
  assert.deepEqual(filterAndSortPlayers(players, stats, "ali", "goals").map(player => player.id), ["c", "a"]);
  assert.deepEqual(filterAndSortPlayers(players, stats, "", "matches").map(player => player.id), ["b", "c", "a"]);
});

test("history periods expose months and years newest first", () => {
  assert.deepEqual(buildHistoryPeriods([{ date: "2025-12-01" }, { date: "2026-02-01" }, { date: "2026-01-01" }]), {
    months: ["2026-02", "2026-01", "2025-12"], years: ["2026", "2025"]
  });
});

test("history filters by player and month without changing the source", () => {
  const matches = [{ date: "2026-02-01", parts: [{ playerId: "a" }] }, { date: "2026-01-01", parts: [{ playerId: "b" }] }];
  const names = id => ({ a: "Ali", b: "Bader" })[id];
  assert.deepEqual(filterMatches(matches, names, "ali", "month:2026-02"), [matches[0]]);
  assert.equal(matches.length, 2);
});

test("reset confirmation is exact and whitespace tolerant", () => {
  assert.equal(isResetConfirmation(" RESET "), true);
  assert.equal(isResetConfirmation("reset"), false);
});

test("comparison outcomes identify both winners and exact ties", () => {
  assert.equal(compareMetricValues(9, 4), "left");
  assert.equal(compareMetricValues(2, 7), "right");
  assert.equal(compareMetricValues(5, 5), "tie");
});

test("localization covers direction, interpolation and count grammar", () => {
  assert.equal(directionFor("ar"), "rtl");
  assert.equal(directionFor("en"), "ltr");
  assert.equal(translate("ar", "dashboardTitle"), "إحصائيات التمرين");
  assert.equal(translate("en", "dashboardTitle"), "Pickup Stats");
  assert.equal(translate("ar", "win"), "فوز");
  assert.equal(translate("ar", "shortWin"), "ف");
  assert.equal(translate("ar", "teamA"), "الفريق أ");
  assert.equal(translate("ar", "openProfile", { name: "Ali" }), "عرض ملف Ali");
  assert.equal(countText("en", 1, "match"), "1 match");
  assert.equal(countText("en", 3, "match"), "3 matches");
  assert.equal(countText("ar", 0, "match"), "0 مباراة");
  assert.equal(countText("ar", 1, "goal"), "هدف واحد");
  assert.equal(countText("ar", 2, "goal"), "هدفان");
  assert.equal(countText("ar", 5, "goal"), "5 أهداف");
  assert.equal(countText("ar", 14, "match"), "14 مباراة");
  assert.equal(countText("ar", 18, "player"), "18 لاعبًا");
});
