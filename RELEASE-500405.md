# Futbolista 500405 — Cleaner voting and earned standings

Validated release 500405. Based on the published 500404 commit
`3e913b38b884140b3c1ca99c0083d6cc41e008c3`. Date: 2026-09-09.
The user explicitly approved frontend publication after local validation.
GitHub Pages tracks the deployed commit; no Firebase rules update is required.

## Improvements

- Removed the public closed-vote 5/3/1 explanation from Dashboard and Profile
  in Arabic and English. The actual ballot still explains choice weights to
  eligible voters; the scoring formula and voting permissions are unchanged.
- Moved the open workout's voting card above all-time standings and streaks,
  after the latest MOTM award, in both visual and keyboard order.
- Hide an empty home-screen voting podium after a successful complete read.
  Loading and failure/retry remain visible. Real results reveal it automatically.
  All-player table/leaderboard views remain available even before any awards.
- Voting leaders have proportional point/award bars and a gold first-place
  accent. Equal totals retain shared ranks, equally sized bars and equal styling;
  everyone tied at the podium boundary is retained. Bars are decorative and the
  actual labeled numeric totals remain readable without color.
- Profile voting-choice counts sit behind a native, keyboard-accessible
  disclosure with a 44px touch target and visible focus. Removed redundant
  weight multipliers. Details start closed, stay open across result/language
  refresh for the same player, and reset for a different player. A zero-point
  profile retains its total but does not show an empty breakdown.
- Zero-point/zero-award players stay in the all-player standings with a dash
  for rank, instead of an unearned first-place badge. Positive ties and ordinary
  football rankings are unchanged.
- Synchronized public assets and Service Worker to 500405. No added dependency,
  network request, animation, schema or stored state.

## Validation

- **197/197** unit/integration tests and **36/36** local Firestore security tests
  passed: **233 total**, including eight new regression tests.
- All 34 tracked JS/MJS files passed syntax checks; `git diff --check` passed.
- **110 responsive checks** passed: Arabic/English × 320/360/390/430/1440 px ×
  Dashboard points, Dashboard MOTM, Leaderboard, Table points, Table MOTM,
  Table monthly awards, Players, Profile, expanded Profile voting details,
  Compare and expanded History. No document overflow, clipping of the checked
  new cards or visible public admin controls.
- Browser checks verified Enter to expand/collapse, a 44px disclosure target,
  visible keyboard focus and preservation across language rerender. No new
  animation is used; existing reduced-motion support is unchanged.
- Local demo admin login with `admin@ftbll.live` succeeded. Admin navigation,
  settings and three trend controls appeared, then disappeared after logout.
  No application data-save buttons were clicked.
- Browser error log was empty. Existing emulator fixtures supplied closed
  votes and tied leaders; they never replaced production data.
- Read-only real-data preview verified 63 players remain in the MOTM table,
  all currently with zero awards and unearned ranks shown as dashes. The live
  workout was still open, so hiding the empty final-results podium is correct.
- Native screenshots include real-data before/after mobile Dashboard, real-data
  desktop Dashboard, and clearly named `demo-*` fixture screenshots for the
  new voting leaders and profile details.

Local-validation limits: physical phones, installed PWA/offline update cycle,
App Store builds and live production login were not exercised. Viewport testing
is not a substitute for testing a physical phone. Cache version consistency is
tested automatically; live publication checks are recorded separately.

## Data protection and delivery

No production document was created, changed or deleted. No migration, reset,
Firestore rules deployment, Authentication change or Firebase configuration
change. Security tests and reseeding targeted the explicitly approved
`demo-futbolista` loopback emulator only. Match calculation, monthly formula,
closed-vote 5/3/1 totals, 24-hour deadline, participant/self-vote restrictions,
JSON export, `CNAME`, GitHub Pages and `admin@ftbll.live` are preserved.

The existing published commit and previous ZIPs remain intact. The new complete
source/test/evidence archive is `Futbolista-500405-ux-polish.zip`, without Git
internals, dependencies, emulator credentials or debug files. That archive
preserves the pre-publication snapshot. Publication was subsequently authorized
by the user; these UI changes do not require redeploying Firebase rules.
