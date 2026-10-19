// Who may see the App Review demo sandbox (a chatChannels doc with
// demoSandbox: true). Client-safe: no admin SDK, so the channel list hook can
// apply the same rule as the server. Owner's call: demo accounts plus Jacob
// (owner, who runs App Review). No other real user, admins and owners included.

/** The one real person who may see the demo sandbox: Jacob. By uid, or by his email. */
export const SANDBOX_STAFF_UIDS: readonly string[] = ['bQWKezQmd1P9Yf3GzOdXXBkDzj93'];
export const SANDBOX_STAFF_EMAILS: readonly string[] = ['jmyers@3cworldgroup.com'];

/** Whether this real (non-demo) person may see the demo sandbox. */
export function isSandboxStaff(uid: string | null | undefined, email?: string | null): boolean {
  if (uid && SANDBOX_STAFF_UIDS.includes(uid)) return true;
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return !!normalized && SANDBOX_STAFF_EMAILS.includes(normalized);
}

/** Whether this person may see a demo sandbox channel at all. */
export function canSeeDemoSandbox(identity: {
  uid?: string | null;
  email?: string | null;
  demoAccount?: boolean | null;
}): boolean {
  return identity.demoAccount === true || isSandboxStaff(identity.uid, identity.email);
}
