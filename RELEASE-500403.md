# Futbolista 500403 — MOTM and current streaks

Status: implemented and validated; included in release 500404. See
`RELEASE-500404.md` for the rules-first production rollout.
Base: production commit `2c42fe1`. Existing Firebase configuration, email/password
authentication and `admin@ftbll.live` identity are unchanged.

## What changed

- Latest closed MOTM result above the dashboard, with prominent linked winner
  name, award date, points and a direct link to the final match result.
- Profile MOTM total across all sessions (not merely the last ten), with links to
  the latest five awards. Full statistical ties share the award; player ID is
  never used to decide a winner. History uses matching joint podium positions.
- Pure streak engine over deduplicated canonical participation data, with
  separate ordinary profile thresholds and stronger dashboard thresholds.
- At most three distinct players in dashboard streaks; prefer different kinds
  of facts and at most one caution. No leaderboard arrows added.
- Admin can hide a particular run from both public surfaces and restore it in
  Settings. Hiding affects presentation only, persists while that run grows, and
  does not suppress a later new run or erase awards/statistics.
- The same run cannot reappear with equivalent unbeaten/winless wording after
  being hidden. Inactive players' old form is not headlined as a current team fact.
- Closed ballot reads are deduplicated/cached for the page lifetime and limited
  to four concurrent archive requests. Open ballots remain private even to admin.
  Failed result loads show an unknown total and retry, never a fabricated zero.
- Choice-free voting receipts support admin confirmation counts without granting
  access to anyone's choices. Updating a ballot does not add a second voter.

## Streak definitions

| Fact | Profile | Dashboard |
| --- | ---: | ---: |
| Consecutive wins | 3 | 5 |
| Unbeaten appearances | 5 | 10 |
| Consecutive losses | 4 | 6 |
| Winless appearances | 5 | 8 |
| Scored in consecutive appearances | 6 | 8 |
| Consecutive team matches attended | 10 | 15 |
| Consecutive MOTM awards | 2 | 3 |

Results/scoring runs follow a player's consecutive appearances. Attendance uses
every team match and breaks on absence. Own goals never extend a scoring run.
Conflicting participation metadata does not establish a result/scoring run.
MOTM runs follow consecutive appearances with known, closed, non-empty voting
results. An ongoing vote is pending, not a defeat; missing/no-vote settled
matches break the run. Tied MOTM counts for each joint winner. No historic votes
or awards are invented or backfilled.

## Additive storage and rollout requirement

No existing collection/field was renamed or migrated. New optional paths:

- `trendVisibility/{encodedPlayerTypeStart}`:
  `{playerId,type,startMatchKey,hidden,updatedAt}` — public read; admin-only
  validated write; no delete. Used only when the admin deliberately hides or
  restores a run. Unknown/unavailable moderation preferences fail closed: the
  streak sections stay hidden until preferences can be read.
- `sessionVotes/{sessionId}/receipts/{uid}`: `{updatedAt}` — admin-only read;
  owner write only alongside a valid ballot with the same server timestamp.
  No choices, email, or display name are stored in receipts.

**Receipt counts are explicitly lower bounds**, not exact historic turnout:
older clients/ballots can have no receipt. Legacy ballot writes remain valid.
Final closed results still tally all valid ballots, including older clients.

After explicit user approval, publish the reviewed additive Firestore rules
BEFORE the frontend. Otherwise the new atomic ballot+receipt write is denied by
old rules. Publishing rules does not create/delete/migrate any data. Never run a
seed script or test suite against production. No backend functions, new Auth
providers, SMS billing, reset, or migration is needed.

Cache/asset release is 500403, including the two new highlights modules.
GitHub Pages, CNAME `ftbll.live`, raw players/logs JSON export and all public/admin
access boundaries are preserved.

## Validation

- 173 no-network automated tests passed (32 additions over 500402).
- 36 Firestore emulator security tests passed (6 additions); explicit user
  approval, loopback only, project `demo-futbolista` only.
- Syntax checks passed for 32 JS/MJS files; `git diff --check` passed.
- 70 recorded responsive observations: AR/EN × 320/360/390/430/1440 × Dashboard,
  Leaderboard, Table, Players, Profile, Compare, History. Each asserts actual
  width, no page overflow, no clipped new cards/scoreboards, no visible admin UI.
- Actual local UI: guest/admin visibility, admin login, one ranked ballot plus
  receipt, admin receipt count 1 while choices remain hidden, hide/reload/restore
  a run, exact career total 6 from 15 final sessions, award-to-history navigation.
- Fresh final browser session reported no JavaScript console errors.
- Screenshots use explicitly labelled disposable emulator fixtures, never
  replacement production data. The public website still uses real Firestore.

Not tested: physical iOS/Android devices, installed PWA upgrade, real production
login/email delivery/voting/moderation, or live rule deployment. No production
data writes, Auth setting changes, push, or publication were performed.

QA logs/screenshots are delivered separately under `outputs/motm-500403`.
Full-page screenshot stitching was unreliable in the browser tooling, so final
evidence uses native viewport screenshots; discard the earlier stitched capture.
