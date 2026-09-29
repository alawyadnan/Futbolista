# Group notifications — setup and operation

This update uses Apple Push Notification service through Firebase Cloud Messaging.
No Cloud Functions, Blaze billing, new football collections, or client-side send
credentials are needed. Firebase Apple app registration is additive; the existing
web Firebase configuration and email accounts must remain unchanged.

## Sending after release

1. Users install the updated iPhone app, open **Account → Group notifications**,
   choose Enable and accept the iOS permission. The administrator's preference
   and sending-dashboard shortcut are under **Settings**.
2. Open Firebase Console for `el-futbolistas` → Messaging → New campaign →
   Notifications. Enter an appropriate short title and message.
3. Target the topic **`futbolista_updates`**. It appears after an opted-in device
   successfully subscribes. Do not send to unrelated Firebase applications.
4. Optionally set custom data `screen` to `dashboard`, `history`, or `leaderboard`.
   Other values open Dashboard; no notification can open an admin action.
5. Review target, message, expiry and scheduling before publishing. A broadcast
   cannot be recalled once fanout starts. Never include private account details.

This is manual broadcasting, not automatic notification on match saving. Delivery
is best-effort and depends on consent, network, Focus and OS settings. Devices with
the original app have no push registration and cannot receive these notifications.

## Privacy and credentials

No Analytics SDK is added. FCM auto-initialization is disabled until consent.
Device registration is independent of Firebase Authentication and player identity.
Tokens stay native and are not sent to Firestore, JavaScript, source control or logs.
Turning off notifications unregisters APNs and attempts topic/token cleanup.
The Firebase config plist is public client configuration, not a signing secret.
APNs private keys must stay outside the repository and be uploaded only to the
owner-approved Firebase project. App Store privacy disclosures must include device
identifiers for App Functionality, not advertising tracking.

## Release gates

- Register matching Apple bundle ID and supply its genuine GoogleService-Info.plist.
- Enable Push Notifications on the Apple App ID and authorize Firebase with an
  appropriately scoped APNs key. Keep free/unlisted Saudi distribution unchanged.
- Build and archive using the existing paid signing team.
- Verify foreground, background and cold-start notification behavior on a real
  device with explicit owner approval for a device-only test; no group test sends.
- Publish updated privacy information and submit the verified native build.

References: https://firebase.google.com/docs/cloud-messaging/ios/get-started ;
https://firebase.google.com/docs/cloud-messaging/send/firebase-console ;
https://firebase.google.com/pricing
