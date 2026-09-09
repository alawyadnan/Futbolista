# Futbolista 500404 — Voting standings and monthly award history

Validated release 500404, including the 500403 MOTM/streak improvements.
Base: `2c42fe1`. Production Firestore rules were activated and verified on
2026-09-09 before frontend publication; GitHub Pages tracks frontend deployments.

## What changed

- Dashboard voting leaders with an accessible points/MOTM toggle, linked player
  names, shared competition ranks and a direct link to the corresponding table.
- Table and Leaderboard can sort by all-time voting points, MOTM award count,
  or Player of the Month award count. Award rankings include all current players;
  ordinary football rankings retain their existing attendance eligibility.
- When sorting the table by an award, that metric moves beside the player name.
  Traditional sorts keep the new columns at the end. Only the table scrolls
  horizontally, not the page; names remain sticky and the selected header has
  the appropriate accessible sort state.
- Profiles show voting points, MOTM count, monthly award count, the 5/3/1 choice
  breakdown, and each completed month won with its existing score out of ten.
- Fixed startup races when authentication or archive callbacks arrive before
  football data, including a direct player-profile link. Added regression tests.
- Shared pure ranking/aggregation code; no new dependencies or additional
  Firebase reads beyond the existing closed-results archive.
- Public assets and Service Worker bumped to 500404, including the new
  `award-statistics.js` module in the offline cache.

## Calculation rules

- Voting points are the sum of validated closed-ballot choices: first = 5,
  second = 3, third = 1. Non-winners retain every earned point. Open votes never
  contribute and are not read for these statistics, including for an admin.
- One workout is counted once. Existing imported-session deduplication and
  ballot validation prevent duplicate sessions, duplicate UIDs, self-votes,
  absent candidates or malformed choices from inflating the result.
- Shared MOTM counts for every joint winner under the existing MOTM tie-breaks.
  Aggregate standings use equal competition ranks for equal selected totals
  (1, 1, 3); display-name/ID ordering does not break a statistical tie. Dashboard
  includes everyone tied at the third-place boundary, not an arbitrary three.
- An incomplete/failed archive shows an unknown total with loading/retry, not
  zero or a misleading partial final ranking. Monthly rankings do not depend
  on successful voting reads.
- Monthly awards use the existing `calculateMonthScores` formula, eligibility,
  name fallback and tie-break order without changes. Only months before the
  device's current calendar month count as earned awards, matching the app's
  existing local calendar convention. The current month remains provisional.
- Monthly history is **derived from the current authoritative football model**,
  not a new persisted award ledger. Correcting historical football entries or
  changing the existing eligibility/name tie-break inputs can therefore change
  past winners, just as it already changes the dashboard's past-month rankings.
  Voting totals are separate from the existing match-statistics monthly award.
- No historic votes or monthly trophies are invented, migrated, or backfilled.

## Safety and rollout

This release requires no production document writes, resets, migrations,
Authentication changes or Firebase configuration changes. Publication updates
only the reviewed security rules and static repository files. Existing
player/log fields, raw JSON export, `admin@ftbll.live`, GitHub Pages, `CNAME`
and public/admin boundaries remain intact. No leaderboard arrows were added.
The new 500404 statistics are entirely read-only and add no Firestore fields.

**The bundled 500403 additive rules were deployed and verified BEFORE the
frontend, with explicit user approval.** The verified release was
`projects/el-futbolistas/rulesets/9ef1ca9a-3ea1-4807-8209-ab4208f0c598`, activated
2026-09-09 at 20:08 UTC. Live rules matched the reviewed base before the update;
published rules matched the tested source afterward. Read-only fingerprints
confirmed that all 63 players, 495 raw logs, 1 voting session and 2 public player
profiles were unchanged. The new atomic ballot receipt requires these rules;
future rollouts must also preserve this rules-first order. No seed script or
emulator test may target production.

## Validation — 2026-09-09

- 189 unit/integration tests passed; 16 additions over local 500403.
- 36 Firestore security tests passed using the explicitly approved loopback
  `demo-futbolista` emulator only. Total automated tests: **225**.
- Syntax checks passed for all 34 JS/MJS files; `git diff --check` passed.
- 90 saved layout cases: Arabic/English × 320/360/390/430/1440 × Dashboard,
  Leaderboard, Table points, Table MOTM, Table monthly awards, Players, Profile,
  Compare, History. Actual viewport widths, page overflow, new-card clipping
  and public admin visibility were asserted. All passed.
- Actual UI: dashboard-to-table preset, MOTM sorting, shared 45-point first
  place, profile 30 voting points / 6 MOTM / 1 monthly award, direct profile
  URL, admin login, visible admin-only controls and logout hiding them again.
- Final browser error log is empty. Screenshot files use native viewport
  captures, with no composite/full-page stitching.
- All screenshots and UI result examples use clearly identified, disposable
  emulator fixtures; they are NOT production players, scores or awards.

Not exercised: physical iOS/Android devices, App Store/Play Store packaging,
live-site deployment/cache activation, production sign-in or production writes.
The test UI did not save a match, add a player, cast a ballot or hide a streak
during this revision; local security tests use temporary authorized data.

## Delivery

`Futbolista-500404-voting-rankings.zip` contains the complete project, source,
tests, rules, release notes and QA evidence, excluding credentials, node_modules,
debug logs and Git internals. Previous 500403 ZIP remains unchanged.
