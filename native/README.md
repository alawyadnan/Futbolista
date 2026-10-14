# Futbolista for iPhone

Historical first submission: App Store version 1.0 (build 2), release 500408.
App Store Connect and the Saudi App Store confirmed **1.0.2** is distributed
on 2026-10-07. The previous submitted binary is build 10.
Current update target: **1.0.3 (11), release 500423**, with first-opening
notification opt-in, mobile visual polish, ranking highlights, award comparisons,
player match filters and a refreshed sports theme.
The bundle has been built and copied into the iOS project for the next update.
The preceding 500422 iOS device Build succeeded on 2026-10-07; it is not proof
that the newly changed 500423 bundle has been compiled or signed. The 500423
source/package tests passed and all 18 generated assets were copied into iOS.
After resetting native automation, Xcode archived **1.0.3 (11)** successfully on
2026-10-07 and uploaded it at 12:48 AST. All 18 archive assets match native/www;
the notification-introduction plugin is present. Xcode's distribution record
reports preparation/upload success with zero errors or warnings. The sandboxed
CLI cannot independently validate the signing trust chain; Xcode handled signing
and App Store validation without changing trust settings. App Store Connect
confirmed **Waiting for Review** for 1.0.3 (11), submitted October 7 at 12:55 AST.
Submission ID: a6cd057a-7594-43a0-8214-c7ece4b46edc. Manual release after approval
remains selected; this is not yet an approved or distributed update.
See `../UPDATE-500423.txt` for the latest changes and validation,
`../UPDATE-500422.txt` for the notification introduction,
and `../UPDATE-500421.txt` for the preceding sports UI improvements.
The latest owner request on 2026-10-07 authorizes improving the interface and
then submitting the update to Apple. This supersedes the earlier local-only hold.
Preserve existing price/distribution/regions and the manual release selection.
See `../UPDATE-500414.md` for the already-published goal adjustments and
`store/PUSH-NOTIFICATIONS.md` for the new optional native notifications.
Historical submission evidence lives in `store/SUBMISSION-STATUS-500408.md`.

## Architecture and identity

The Capacitor container packages the repository's shared web interface and Firebase
10.12.2 SDK locally. It does not load remote JavaScript or a live server URL.
Project: `ios/App/App.xcodeproj`; shared scheme: `App`.
Bundle ID: `live.ftbll.futbolista`; deployment target: iOS 15+.
Do not change the bundle ID, native hostname/scheme or Firebase configuration:
existing account identity, app storage and upgrade continuity depend on them.

Email/password, verified-email linking and administrator approval are unchanged.
Google/SMS login remain unimplemented. Optional native group notifications use
Firebase Messaging 12.19.2, added independently from the unchanged web Auth SDK.
Users can opt in on the first opening without signing in, or later under Account.
The optional invitation remembers Not now locally and respects existing iOS
permissions. Administrators have preferences and a Firebase Notifications composer
shortcut under Settings. No paid sending backend is used.
In-app account-deletion requests are implemented; the owner processes them within
seven days using `store/ACCOUNT-DELETION-RUNBOOK.md`. No client-side deletion
cascade runs. Existing match data remains authoritative.

## Build

Use Node 22+, pnpm 11.19.0 and the installed Xcode. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm sync
pnpm test
pnpm check
pnpm open
```

The sync step regenerates `www/`, `ios/App/App/public/`, Capacitor config and
Swift package paths. Never edit generated assets directly. After a clean checkout,
install dependencies and run sync before opening Xcode. No script uploads an app.

Use Product > Build or a simulator Run for local verification. A web build and
package checks alone do not prove a signed archive works. The check command
intentionally cannot certify App Store readiness; `--release` remains fail-closed.

## Preserved integrations

Native share sheet for profiles, comparisons, individual matches and the unchanged raw JSON export;
private temporary export files are removed after sharing. Haptics respect reduced
motion. Status-bar and safe-area styling remain. Foreground refresh rechecks closed
vote results after five minutes, without continuous polling or any data writes.

Public share URLs include `https://ftbll.live/#player/...` and `https://ftbll.live/#history/match/...`.
Publish the matching website route support before distributing this bundle so match links work for recipients.
Custom URLs such as
`futbolista://app/#player/...` select only allowlisted screens and never actions.
HTTPS Universal Links are not configured. Incoming links do not discard active
forms. Device accounts do not share Safari's authentication storage.

## Next release gate

1. Review this update on the owner's physical iPhone, including keyboard,
   foreground/background, sharing cancellation and existing account persistence.
2. Verify the latest App Store version/build, choose a fresh unused build number
   and appropriate version, then create a signed Release archive with the existing developer team.
3. Upload and submit only after explicit owner approval. Preserve the app's
   free/unlisted distribution and Saudi availability.

No credentials, signing private keys or provisioning profiles belong in source.
