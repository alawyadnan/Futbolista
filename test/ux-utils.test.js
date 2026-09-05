import test from "node:test";
import assert from "node:assert/strict";
import { countText, directionFor, translate } from "../i18n.js";
import { appRouteFor, buildHistoryPeriods, buildPlayerAvatar, compareMetricValues, compareRouteFor, filterAndSortPlayers, filterMatches, isResetConfirmation, isValidISODate, normalizePlayerName, paginateItems, parseAppRoute, playerNameKey, publicAppUrl, selectDisplayMonth } from "../ux-utils.js";

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

test("player avatars use useful stable initials and tones", () => {
  const avatar = buildPlayerAvatar("Abdullah M");
  assert.equal(avatar.initials, "AM");
  assert.equal(Number.isInteger(avatar.tone), true);
  assert.equal(avatar.tone >= 0 && avatar.tone < 5, true);
  assert.equal(buildPlayerAvatar("Mustafa").initials, "MU");
  assert.equal(buildPlayerAvatar("سيد أحمد").initials, "سأ");
  assert.deepEqual(buildPlayerAvatar("Mustafa"), buildPlayerAvatar("Mustafa"));
  assert.deepEqual(buildPlayerAvatar(""), { initials: "?", tone: 0 });
});

test("public routes support navigation and encoded player deep links", () => {
  assert.deepEqual(parseAppRoute("#history"), { screen: "history", playerId: "" });
  assert.deepEqual(parseAppRoute("#/players"), { screen: "playerstats", playerId: "" });
  assert.deepEqual(parseAppRoute("#player/player%20id"), { screen: "playerprofile", playerId: "player id" });
  assert.deepEqual(parseAppRoute("#player/player%2Fid"), { screen: "playerprofile", playerId: "player/id" });
  assert.deepEqual(parseAppRoute("#player/%E0%A4%A"), { screen: "dashboard", playerId: "" });
  assert.deepEqual(parseAppRoute("#settings"), { screen: "dashboard", playerId: "" });
  assert.equal(appRouteFor("playerstats"), "#players");
  assert.equal(appRouteFor("playerprofile", "player id"), "#player/player%20id");
  assert.equal(appRouteFor("settings"), "#dashboard");
});

test("comparisons have stable shareable deep links", () => {
  assert.equal(compareRouteFor("player a", "player/b"), "#compare/player%20a/player%2Fb");
  assert.equal(compareRouteFor("a", "a"), "#compare");
  assert.deepEqual(parseAppRoute("#compare/player%20a/player%2Fb"), {
    screen: "compare",
    playerId: "",
    playerAId: "player a",
    playerBId: "player/b"
  });
  assert.deepEqual(parseAppRoute("#compare/a/a"), { screen: "compare", playerId: "" });
  assert.deepEqual(parseAppRoute("#compare/%E0%A4%A/b"), { screen: "compare", playerId: "" });
});

test("shared app links omit cache-busting query parameters", () => {
  assert.equal(
    publicAppUrl("https://ftbll.live/?release=old#dashboard", "#player/a%20b"),
    "https://ftbll.live/#player/a%20b"
  );
});

test("pagination returns a stable visible slice and remaining count", () => {
  const items = Array.from({ length: 23 }, (_value, index) => index + 1);
  assert.deepEqual(paginateItems(items, 10), { visible: items.slice(0, 10), remaining: 13 });
  assert.deepEqual(paginateItems(items, 30), { visible: items, remaining: 0 });
  assert.deepEqual(paginateItems(items, 0), { visible: [1], remaining: 22 });
  assert.deepEqual(items, Array.from({ length: 23 }, (_value, index) => index + 1));
});

test("admin input helpers normalize names and reject impossible dates", () => {
  assert.equal(normalizePlayerName("  Ali   Khater  "), "Ali Khater");
  assert.equal(playerNameKey("ＡＬＩ  KHATER"), playerNameKey("ali khater"));
  assert.equal(isValidISODate("2024-02-29"), true);
  assert.equal(isValidISODate("2026-02-29"), false);
  assert.equal(isValidISODate("2026-04-31"), false);
  assert.equal(isValidISODate("2026-04-30"), true);
  assert.equal(isValidISODate("04/30/2026"), false);
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
