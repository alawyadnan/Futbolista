# Futbolista for iPhone

Published baseline: App Store version 1.0 (build 2), release 500408.
Current local update: **1.0.1 (build 7), release 500413**. Not uploaded or published.
See `../UPDATE-500413.md` for scope, verification and remaining release steps.
Historical submission evidence lives in `store/SUBMISSION-STATUS-500408.md`.

## Architecture and identity

The Capacitor container packages the repository's shared web interface and Firebase
10.12.2 SDK locally. It does not load remote JavaScript or a live server URL.
Project: `ios/App/App.xcodeproj`; shared scheme: `App`.
Bundle ID: `live.ftbll.futbolista`; deployment target: iOS 15+.
Do not change the bundle ID, native hostname/scheme or Firebase configuration:
existing account identity, app storage and upgrade continuity depend on them.

Email/password, verified-email linking and administrator approval are unchanged.
Google/SMS login and push notifications are not implemented in this version.
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

Native share sheet for profiles, comparisons and the unchanged raw JSON export;
private temporary export files are removed after sharing. Haptics respect reduced
motion. Status-bar and safe-area styling remain. Foreground refresh rechecks closed
vote results after five minutes, without continuous polling or any data writes.

Public share URLs remain `https://ftbll.live/#player/...`. Custom URLs such as
`futbolista://app/#player/...` select only allowlisted screens and never actions.
HTTPS Universal Links are not configured. Incoming links do not discard active
forms. Device accounts do not share Safari's authentication storage.

## Next release gate

1. Review this update on the owner's physical iPhone, including keyboard,
   foreground/background, sharing cancellation and existing account persistence.
2. Create a signed Release archive of 1.0.1 (7) with the existing developer team.
3. Upload and submit only after explicit owner approval. Preserve the app's
   free/unlisted distribution and Saudi availability.

No credentials, signing private keys or provisioning profiles belong in source.
