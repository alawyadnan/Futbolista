# Manual account deletion — operator procedure

Owner-approved service level: complete within seven days of the authenticated
in-app request; send confirmation to its account email. Do not run this process
for development testing on production. This document does not authorize deleting
any particular account. A genuine pending request is required.

The app writes an immutable `deletionRequests/{uid}` document. Owners (including
unverified accounts) can read/create their own request, never another user's.
Only the football administrator can list requests. Client updates/deletes and
fake completion states are forbidden. Existing collections retain their schemas.
New profile changes, link approvals and ballots are blocked for a pending UID.

## Processing a genuine request

1. Read the pending request in the administration screen/Firebase Console. Match
   its exact UID and email to Firebase Authentication, not just the player's name.
   Identify `users/{uid}.playerId` if linked; verify `playerClaims/{playerId}.uid`
   matches before touching that claim or profile. Stop on any mismatch. Record
   only the email needed for the completion message, privately and temporarily.
2. Disable this exact Authentication user. Allow at least 65 minutes for existing
   ID tokens to expire before removing the request/locks. If privileged tooling
   is available, also revoke refresh tokens; revocation alone does not instantly
   invalidate existing Firestore ID tokens. Never remove the request first.
3. Enumerate all `sessionVotes` documents (including older/closed sessions). Delete
   only each session's `ballots/{uid}` and `receipts/{uid}` if present. Do not
   delete session documents, other ballots, candidates, logs, scores or awards
   manually. Awards recalculate from remaining ballots on a fresh load.
4. Delete this UID's `accountRequests/{uid}` and `users/{uid}`. If its verified
   reciprocal claim exists, delete `playerClaims/{playerId}` and the corresponding
   `playerProfiles/{playerId}`. Do not touch an unrelated claim/profile.
5. Preserve shared football results and IDs, but remove identifying presentation
   from the deleted player's shared record: set its name to `Deleted player` and
   remove any other personal presentation fields after reviewing the actual
   record. Review legacy log fields for copied personal names/contact details;
   remove personal details only, retaining player IDs, dates and numeric results.
   Do not delete player/log documents or rewrite scores. This anonymization is
   part of fulfilling the person's deletion request, never a development action.
6. Delete the exact Firebase Authentication UID. Verify all targeted account data
   is absent, remaining match records unchanged except reviewed anonymization,
   and unrelated accounts/claims untouched. If any step fails, leave the pending
   request and resume safely; do not announce completion.
7. Email the account's prior address with a brief completion confirmation (no
   UID, password, ballot choices or other participants' data). Then remove the
   exact `deletionRequests/{uid}` document in the privileged Firebase Console and
   discard the temporary contact information. Do not keep a personal-data audit
   copy inside this repository, source control or app logs.

An administrator-account request needs the project owner to perform this process
directly in Firebase Console. Never delete the last management identity without
first arranging continued project ownership; do not deny the deletion request.
Previously exported copies outside the service are not recoverable by this app.

## Verification scope

Rules and UI are tested only with local in-memory adapters and the isolated
`demo-futbolista` Firestore emulator. Production deletion is not a release test.
Do not claim automated server-side deletion; the owner performs the steps above.
