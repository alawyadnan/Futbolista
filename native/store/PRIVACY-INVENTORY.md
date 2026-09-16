# Privacy and review preparation — owner review required

This inventory is not a published privacy policy or legal determination.
Do not claim “Data not collected” in App Store Connect.

| Existing data | Use | Visibility |
| --- | --- | --- |
| Email, Firebase UID and authentication credentials | Sign-in and verification | Account owner / authorized service and admin; no passwords in this repository |
| Link request and approved player identity | Admin approval and voting eligibility | Protected by existing Firestore rules |
| Display name and chosen shirt number | Player presentation | Public profiles |
| Match participation, goals, results and awards | Football statistics | Public statistics |
| Ballot selections and participation receipts | MOTM ranking and voting controls | Existing rules hide others' live ballots; final results become public after closing |
| Language and pinned player | Device preferences | Device-local storage |
| Temporary JSON export | Owner-triggered backup sharing | Native private cache until sharing completes |

No analytics, ads, tracking, contacts, location, microphone, camera, payment or
push-notification integration was added. Firebase remains the existing processor.
Confirm actual provider retention/logging and relevant App Store categories
against the final deployed backend; a JS SDK inside a WebView still handles data.

The owner approved **allaw.68@gmail.com** as the public support/contact email and
manual processing of in-app deletion requests within **seven days**. These are
approved requirements, not implemented capabilities or a published policy.
Before release, confirm the remaining controller details, retention policy,
linked-identity deletion/anonymization treatment, user-generated-content
handling and publication URLs. Do not fabricate these.

Account deletion must be discoverable inside the app and cannot be replaced by
an instruction to email support. Apple permits manual processing when the
timeline is disclosed and completion is confirmed. Implement a protected
request flow and an actual, repeatable deletion procedure covering account,
claim and ballot relationships, with emulator-only tests. Merely hiding or
disabling an account is not deletion. Do not delete live accounts during
development, or silently erase shared football history. The owner rejected
additional usage-based billing; a paid automatic backend is not authorized.

Reference: https://developer.apple.com/support/offering-account-deletion-in-your-app

The required-reason manifest currently declares app-cache FileTimestamp use
(C617.1) for native JSON export. It does not replace App Store privacy labels.
Validate the final archive's merged privacy report in Xcode before submission.
