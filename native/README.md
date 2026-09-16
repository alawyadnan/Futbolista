# Futbolista for iPhone — preparation build

Current release preparation: see `store/SUBMISSION-STATUS-500408.md` for the
tested deletion-request implementation, deployed rules and actual upload status.
Earlier preparation notes below describe the original private-build stage.

This is a real Capacitor/Xcode project, **not a signed IPA or an App Store-ready
release yet**. The existing website remains deployable independently from the
repository root. No Firebase setup, authentication provider, collection, rule,
field or production document was changed.

## What is ready

- Native iOS project: `ios/App/App.xcodeproj`, shared scheme `App`.
- Name: Futbolista. Provisional bundle ID: `live.ftbll.futbolista`.
  Confirm/register it with the owner before the first store upload.
- Version 1.0, build 1, iOS 15+. Capacitor 8.5.2 and Swift Package Manager.
- Packaged JavaScript/CSS/images, including the exact Firebase JS SDK 10.12.2
  used by the website. No remote-code bootstrap or production `server.url`.
- Same Firebase project, existing emails/passwords, linked player IDs, approval
  process and statistics. Users sign into the app once; Safari's saved login and
  local preferences do not automatically transfer to the native sandbox.
- Native share sheet for profiles/comparisons and the existing raw JSON backup.
  Export files live briefly in private cache, then are removed after sharing.
- Light selection haptics, dark status bar, safe-area styling, resume rendering,
  a network-status banner and guarded public deep links.
- App icon and launch images rendered from the existing SVG logo.
- Required-reason privacy manifest for Filesystem's app-cache timestamp use.
  This manifest is **not** the final App Store privacy questionnaire.

## Build after installing Xcode

Requirements: Node 22+, pnpm 11.19.0, Xcode 26+. Update, 16 September 2026:
Xcode 27.0 and iOS 27 support are now installed, and the project was built and
launched on an iPhone 17e simulator. The owner authorized Personal Team signing;
Xcode configured the profile/certificate and built an iPhoneOS app bundle.
The owner enabled Developer Mode and trusted the Developer App certificate.
Xcode installed and launched the app on the owner's iPhone 14 Pro / iOS 27.0.
The actual device's dashboard and public Firebase data were visually verified
through Device Hub. Full on-device interaction/authentication and standalone
relaunch after disconnecting remain untested. See `PRIVATE-BUILD-STATUS.md`.

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm sync
pnpm test
pnpm check
pnpm open
```

The sync step bundles root sources and copies them into the iOS project. Do not
edit `www/` or `ios/App/App/public/` by hand. Existing PNG assets are included;
`pnpm icons` regenerates them if the source SVG changes. Do not run `cap add ios`
again: the checked-in project already has its privacy manifest and URL scheme.

In Xcode select the `App` scheme, select the owner's signing team, then a
simulator or connected iPhone. Xcode has saved the owner's Team ID in the local
project for private testing. No certificate, private key, password, provisioning
profile or Apple credential is stored in the source tree. Remove the local Team
ID before distributing a generic source package. For a signing-independent compile:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
```

For a device/TestFlight archive, complete the native checks below, set the real
signing team in Xcode, then Product → Archive. No upload or paid enrolment is
performed by any script in this project.

## Links and accounts

Shared links remain normal `https://ftbll.live/#player/...` URLs so friends
without the app can still open them. Custom app links such as
`futbolista://app/#player/PLAYER_ID` are supported. They only select approved
public screens; they cannot open admin screens, run actions or copy query
parameters. Active forms are not silently discarded by an incoming link.

Automatic HTTPS Universal Links are **not enabled**: they require the owner's
Apple Team ID, associated-domain entitlement and an `apple-app-site-association`
file on ftbll.live. Do not change the native hostname/scheme after release;
doing so changes the web-storage origin and may lose local sessions/preferences.

The app still uses email/password. No phone-number migration or new-account
requirement was introduced. Email confirmation continues through Firebase's
existing email and the app's “I've verified my email” action. Actual native
sign-in/confirmation must be tested on-device before distribution.

## Before App Store / external TestFlight review

1. Install Xcode, compile, and run on iPhone. Verify status bar, keyboard, notch,
   large text, VoiceOver, rotation, background/resume and cancelled sharing.
2. Test login, verification, approved linking, voting and admin visibility using
   approved isolated test data; never use production matches as test fixtures.
3. Implement secure in-app account deletion, including associated account data.
   **This is a release blocker.** Do not just call Firebase `deleteUser`: that
   could orphan claims/ballots/profiles. The owner approved an in-app request
   with manual processing within seven days, avoiding additional paid services.
   This workflow is not implemented yet. It needs a reviewed authenticated
   request flow, associated-data deletion procedure and local security tests.
   Any backend deployment requires explicit approval; extra billing is prohibited.
   Preserve shared football history through an agreed retention/anonymization
   policy; do not silently delete player/log documents or rewrite final scores.
4. Approve and publish privacy/support pages, then fill the App Store data
   disclosure accurately. See `store/PRIVACY-INVENTORY.md`.
5. Configure the developer team/App Store record, check export-compliance answers,
   supply real review access/instructions, capture actual device screenshots and
   test through TestFlight. Do not supply fictional accounts or screenshots.
6. Explain the existing statistics, match archive, comparisons, player linking
   and native integrations to review. App Review approval is not guaranteed;
   native packaging alone does not satisfy minimum-functionality requirements.

`node scripts/check.mjs --release` intentionally fails while these release
blockers are open. A successful web build is not proof that an iOS app compiled.

Official references: [Capacitor iOS](https://capacitorjs.com/docs/ios),
[Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app),
[App Review](https://developer.apple.com/app-store/review/).
