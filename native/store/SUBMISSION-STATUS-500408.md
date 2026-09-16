# Submission preparation — release 500408, iOS 1.0 build 2

**Not uploaded or submitted for review. Website publication in progress.**
The owner corrected the accidental refusal and explicitly approved deploying
the deletion-request rules. The live rules matched the previous repository
version, and the tested additive changes were published successfully through
Firebase Console on 16 September 2026 at 14:06 local time. No Firestore documents
were written or deleted. Privacy/support publication is in progress. Unlisted
distribution is intended, not requested from or approved by Apple. Manual release
remains selected.

## Implemented locally

- Authenticated in-app deletion requests, including unverified accounts, with
  explicit confirmation, idempotent transaction, loading/error/pending states.
- Admin-only request list and manual 7-day processing runbook. No fake completion
  button. No client-side account deletion or production deletion during testing.
- Additive deletionRequests security rules. Pending users cannot change profiles,
  vote or get newly linked. Existing football collection schemas are unchanged.
- Arabic/English privacy/support pages, native-bundled links and isolated service
  worker navigation caches (policy visits cannot replace the cached app shell).
- Web release 500408 and native build 2; standard encryption exemption metadata.

Owner approved deleting associated ballots (which may change historical awards)
while preserving shared results. Owner approved one separate Apple-review Auth
account with no player link, match or ballot; it **has not been created yet**.
Owner supplied review contact details; fields were entered in App Store Connect,
but saving them has not been reverified. Do not store the private review phone or
credentials in this repository. Google provider was enabled previously; social
sign-in UI/native integration remains unimplemented. Existing email login stays.

## Verification

- 218 unit/integration tests pass, including new deletion UI/cache tests.
- 38 security tests pass in demo-futbolista on loopback. The Firebase CLI later
  exited 2 for its local update-config permission error, after reporting the test
  script exited 0 and shutting down the emulator. No production test writes.
- Native build/sync, 6 package tests and copied-asset checks pass.
- New native visual/login QA and genuine store screenshots remain outstanding.
- Xcode created a 1.0 (2) archive at 13:46 on 16 September 2026. Upload failed
  because its cached team was Personal Team. Restarting Xcode refreshed the team
  to the paid membership (same verified PWC93S9KK8). The second 1.0 (2) archive
  completed successfully; Organizer displays Alawy Alshakhouri without Personal
  Team. It has not been validated for distribution or uploaded.

## Resume

1. Deletion-request rule deployment is now approved and complete. Do not change
   unrelated production rules or write production test data.
2. Finish native visual checks, iPhone/iPad screenshots, review account, privacy
   labels, content rights, age rating, category and availability.
3. Publish the validated source/pages only when the new backend is authorized and
   operational. Do not submit nonexistent policy/support URLs.
4. Validate/upload the paid-team archive, select the processed build, submit with
   Unlisted intent in Review Notes, then file Apple's separate Unlisted request.
   Wait for Unlisted approval before manual release.

Original work/Futbolista-deploy remains untouched. The separate checkout
work/Futbolista-store-release contains a pending copy for a future reviewed push;
no commit/push occurred. GitHub CLI authorization succeeded; its temporary config
outside the source has directory mode 700 and credential files mode 600.
Firebase CLI is not authenticated.
