# Futbolista 500406 — Mobile-first visual refresh

Validated release. Date: 2026-09-11 (Asia/Riyadh).
Based on published commit `a7f9e0167a9b5ff4e0d39b604f2ea4e51ef5013b`.
The user explicitly approved frontend publication after local validation.
GitHub Pages tracks the deployed commit; no Firebase rules update is required.

## Improvements

- Compact Leaderboard rows show the rank, player avatar/name, recent form and
  the selected statistic together. More names fit on a phone screen. All eleven
  sorting choices remain; no leaderboard arrows were added.
- The keyboard-accessible "All statistics" / "تفاصيل الأرقام" button reveals
  the existing detailed statistics. It preserves its expanded state across
  language changes and rerenders. No statistics or player links were removed.
  The redundant internal standings heading and default-sort explanation were
  removed; the page heading and selected sorting option remain.
- The latest MOTM card gives the winner's name and final points stronger visual
  emphasis. Joint winners remain visible, with their shared total shown once.
  Empty, loading and error/retry states are preserved.
- Trend cards pair one prominent count with a short, natural label, avoiding a
  repeated count in the visible sentence. The complete counted description
  remains available to assistive technology. Thresholds and moderation are
  unchanged.
- Profile statistics use a balanced mobile grid, larger labels, a circular
  avatar and restrained gold accents for voting awards. All ten tiles remain.
  Table and comparison text is more legible; card borders, spacing and page
  headings are calmer throughout the existing dark-green interface.
- Public resources, manifest and Service Worker are synchronized to 500406.
  No added dependency, image download, animation or data request. Existing
  keyboard focus and reduced-motion support remain in place.

## Validation

- **203/203** unit/integration tests and **36/36** local Firestore security
  tests passed: **239 total**. Six new regression tests cover metric formatting,
  actual leaderboard rendering, disclosure behavior, bilingual trend labels,
  shared MOTM winners and empty/error MOTM rendering.
- All **35 JS/MJS** source and test files passed syntax checks.
  `git diff --check` passed.
- **121 responsive checks** passed using real-data, read-only local previews:
  100 base checks across Arabic/English and 320/360/390/430/1440 px;
  10 explicit expanded-profile-details checks across both languages and every
  width; and all 11 Leaderboard sorting options at 320 px in Arabic.
  The base checks cover Dashboard, compact/detailed/voting Leaderboard, MOTM
  Table, Players, Profile, Profile details, Compare and expanded History.
- No page-level horizontal overflow, clipping of the checked statistics/cards,
  or visible public administration controls. Tables retain internal scrolling.
- Enter expands and collapses Leaderboard details; the target is 48 px high,
  focus is visible, and a language change preserves state and ordering.
- The browser error log was empty. Screenshots use real data, not seeded demo
  players. A mobile Leaderboard before/after pair, mobile Dashboard/Profile and
  desktop Leaderboard are included in the delivery archive.

Limits: no physical-phone test, installed-PWA/offline update cycle, production
admin login, account creation, email delivery or production form submission.
Admin visibility and permissions are covered by existing automated tests and
public UI checks; this revision did not repeat an interactive admin login.
Reduced-motion support was checked in source, not by changing OS preferences.

## Data protection and delivery

No production data was created, edited or deleted. No migration, reset,
Firebase configuration, Authentication, rules or index change. Security-test
writes were confined to the explicitly approved `demo-futbolista` loopback
emulator, which was stopped after testing. No real save, vote or moderation
button was used.

Football calculations, 5/3/1 voting totals, 24-hour deadline, participation and
self-vote restrictions, monthly awards, JSON export and `admin@ftbll.live` are
unchanged. GitHub Pages and the `ftbll.live` CNAME are preserved. Local validation
did not commit, push or deploy. Publication was subsequently authorized by the
user; post-publication checks are recorded separately in the delivery evidence.

The pre-publication source/test/evidence archive is
`Futbolista-500406-visual-refresh.zip`. It remains an unchanged local-validation
snapshot. The published delivery archive adds its deployed commit and checks.
Archives exclude Git internals, dependencies, emulator tools, credentials and
debug files. All previous release archives remain intact.
