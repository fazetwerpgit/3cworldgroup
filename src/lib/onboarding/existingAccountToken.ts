const WRONG_PASSWORD_CODES = [
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/wrong-password',
  'auth/user-not-found',
];

// A separate Firebase app, so proving the hire's account never touches the
// portal session saved on this browser (a manager onboarding a recruit on the
// manager's own phone stays signed in, and so do other portal tabs).
const VERIFY_APP_NAME = 'onboard-verify';

// Signs in to the hire's existing account just long enough to prove it is
// theirs: the ID token goes with the packet, then the in-memory session is
// dropped. The link never sets an existing account's password. Null on a
// wrong password.
export async function existingAccountToken(email: string, password: string): Promise<string | null> {
  const [{ app }, { getApps, initializeApp }, firebaseAuth] = await Promise.all([
    import('@/lib/firebase/config'),
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  if (!app) throw new Error('Sign-in is not available right now. Try again later.');
  const existing = getApps().find((candidate) => candidate.name === VERIFY_APP_NAME);
  const verifyApp = existing ?? initializeApp(app.options, VERIFY_APP_NAME);
  let auth;
  try {
    auth = firebaseAuth.initializeAuth(verifyApp, { persistence: firebaseAuth.inMemoryPersistence });
  } catch {
    // Already initialized by an earlier try on this page: reuse it.
    auth = firebaseAuth.getAuth(verifyApp);
  }
  try {
    const credential = await firebaseAuth.signInWithEmailAndPassword(auth, email, password);
    const idToken = await credential.user.getIdToken();
    await firebaseAuth.signOut(auth).catch(() => undefined);
    return idToken;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (WRONG_PASSWORD_CODES.includes(code)) return null;
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many tries. Wait a few minutes, or email yourself a reset link.');
    }
    throw new Error("Couldn't sign in. Try again.");
  }
}
