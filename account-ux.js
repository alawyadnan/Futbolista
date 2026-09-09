// Presentation only. Firebase and Firestore remain the authority for access.
export function accountJourney({ emailVerified = false, linked = false, requestStatus = '' } = {}) {
  const current = !emailVerified ? 0 : linked ? 3 : requestStatus === 'pending' ? 2 : 1;
  return ['verifyStep', 'choosePlayerStep', 'approvalStep'].map((label, index) => ({
    label, complete: index < current, current: index === current
  }));
}

export function authFeedbackKey(error) {
  const keys = {
    'auth/invalid-credential': 'accountSignInFailed',
    'auth/wrong-password': 'accountSignInFailed',
    'auth/user-not-found': 'accountSignInFailed',
    'auth/invalid-email': 'accountInvalidEmail',
    'auth/email-already-in-use': 'accountEmailInUse',
    'auth/network-request-failed': 'accountNetworkError',
    'auth/too-many-requests': 'tooManyAttempts',
    'auth/weak-password': 'strongPassword',
    'auth/user-disabled': 'accountUnavailable',
    'auth/requires-recent-login': 'accountSignInAgain'
  };
  return Object.hasOwn(keys, error?.code) ? keys[error.code] : null;
}
