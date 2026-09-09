import test from 'node:test';
import assert from 'node:assert/strict';
import { accountJourney, authFeedbackKey } from '../account-ux.js';
import { translate } from '../i18n.js';

test('unverified accounts always start at verification, even with a stale link', () => {
  const steps = accountJourney({ linked: true, requestStatus: 'pending' });
  assert.deepEqual(steps.map(step => step.current), [true, false, false]);
  assert.equal(steps.some(step => step.complete), false);
});
test('verified accounts without a request choose a player next', () => {
  const steps = accountJourney({ emailVerified: true });
  assert.equal(steps[0].complete, true);
  assert.equal(steps[1].current, true);
  assert.equal(steps[2].complete, false);
});
test('pending request waits for admin, but does not imply an approved link', () => {
  const steps = accountJourney({ emailVerified: true, requestStatus: 'pending' });
  assert.deepEqual(steps.map(step => step.complete), [true, true, false]);
  assert.equal(steps[2].current, true);
});
test('rejected and unknown requests can be corrected without deleting the account', () => {
  for (const requestStatus of ['rejected', 'unknown', 'approved']) {
    const steps = accountJourney({ emailVerified: true, requestStatus });
    assert.equal(steps[1].current, true);
  }
});
test('only a verified account with its actual link completes every step', () => {
  const steps = accountJourney({ emailVerified: true, linked: true });
  assert.ok(steps.every(step => step.complete && !step.current));
});
test('sign-in failures do not reveal whether a user exists', () => {
  for (const code of ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password']) {
    assert.equal(authFeedbackKey({ code }), 'accountSignInFailed');
  }
});
test('unknown errors never render raw Firebase messages or prototype properties', () => {
  assert.equal(authFeedbackKey({ code: '__proto__', message: 'private details' }), null);
  assert.equal(authFeedbackKey({ code: 'toString' }), null);
  assert.equal(authFeedbackKey(), null);
});
test('account journey and actionable errors are translated in both languages', () => {
  const keys = [...accountJourney().map(step => step.label), ...[
    'invalid-email', 'email-already-in-use', 'network-request-failed', 'too-many-requests',
    'weak-password', 'user-disabled', 'requires-recent-login', 'invalid-credential'
  ].map(code => authFeedbackKey({ code: `auth/${code}` }))];
  for (const language of ['ar','en']) for (const key of keys) assert.notEqual(translate(language,key),key);
});
