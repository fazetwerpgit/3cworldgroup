// Turn Firebase auth error codes into plain-language, actionable messages.
export function friendlyAuthError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const raw = err instanceof Error ? err.message : '';
  const c = `${code} ${raw}`;
  if (c.includes('email-already-in-use')) return 'An account with this email already exists. Try signing in instead.';
  if (c.includes('weak-password')) return 'Password is too weak. Use at least 6 characters.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Invalid email or password. Please try again.';
  if (c.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (c.includes('user-disabled')) return 'This account has been disabled. Contact your manager.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Wait a minute, then try again.';
  if (c.includes('network-request-failed')) return 'Network error. Check your connection and try again.';
  if (c.includes('popup-closed-by-user') || c.includes('cancelled-popup-request')) return 'Sign-in was cancelled.';
  if (c.includes('popup-blocked'))
    return 'Your browser blocked the sign-in popup. Please allow popups and try again.';
  if (c.includes('unauthorized-domain'))
    return "This site isn't authorized for Google sign-in. Please contact an administrator.";
  if (c.includes('account-exists-with-different-credential'))
    return 'An account already exists with this email using a different sign-in method. Try email and password.';
  if (c.includes('not-configured')) return 'Sign-in isn’t configured. Contact your administrator.';
  return 'Something went wrong. Please try again.';
}
