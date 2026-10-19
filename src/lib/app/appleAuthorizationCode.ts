// After a Sign in with Apple in the 3C iOS app, hand Apple's one-time
// authorization code to the server (POST /api/portal/auth/apple-token), which
// swaps it for a refresh token so account deletion can revoke Apple access
// (App Store guideline 5.1.1(v)). Best effort and fire-and-forget: it never
// throws and never holds up the sign-in. Older shells send no code; then this
// does nothing.

interface IdTokenUser {
  getIdToken: () => Promise<string>;
}

export async function sendAppleAuthorizationCode(
  user: IdTokenUser | null | undefined,
  authorizationCode: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!user || typeof authorizationCode !== 'string' || !authorizationCode) return false;
  try {
    const idToken = await user.getIdToken();
    const res = await fetchImpl('/api/portal/auth/apple-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ authorizationCode }),
    });
    if (!res.ok) console.warn('[apple] the server did not store the Apple sign-in', res.status);
    return res.ok;
  } catch (error) {
    console.warn('[apple] could not send the Apple authorization code', error);
    return false;
  }
}
