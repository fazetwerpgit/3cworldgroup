// Owner's call (10/19): nobody may use another user's exact name. "Exact" ignores
// case and spacing ("jane  DOE" matches "Jane Doe"), nothing else: real people
// can share a first name, but an exact copy is how someone poses as a teammate
// in chat and on the Board. Checked everywhere a name is set (profile edit,
// admin edit and approval, website onboarding; signup is flagged for the admin
// because the client creates that doc directly).
//
// Only accounts that could still pose as someone count. Suspected bots
// (suspectedBot), deactivated accounts (status 'inactive'), deleted or
// anonymized ones (selfDeleted / deletedAt, or the 'Deleted user' name) and
// App Review demo accounts (demoAccount) never block a name.
//
// There is no normalized-name field on users docs, so the check scans the
// collection, reading only the fields it needs (select).

import { DELETED_USER_NAME } from './accountClosure';
import { DEMO_ACCOUNT_FIELD } from './demoAccount';

/** The comparison key for a display name: trimmed, inner spaces collapsed, lower case. */
export function displayNameKey(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

interface UsersDb {
  collection(path: string): {
    select(...fields: string[]): { get(): Promise<{ docs: Array<{ id: string; get(field: string): unknown }> }> };
  };
}

const DELETED_KEY = displayNameKey(DELETED_USER_NAME);

/** Whether this users doc still holds its name: not a bot, deactivated, deleted or demo account. */
export function holdsDisplayName(doc: { get(field: string): unknown }): boolean {
  if (doc.get('suspectedBot') === true) return false;
  if (doc.get('status') === 'inactive') return false;
  if (doc.get('selfDeleted') === true || doc.get('deletedAt') != null) return false;
  if (doc.get(DEMO_ACCOUNT_FIELD) === true) return false;
  return displayNameKey(doc.get('displayName')) !== DELETED_KEY;
}

/** Whether another live user already has this exact name. */
export async function isDisplayNameTaken(db: UsersDb, name: string, selfUid?: string | null): Promise<boolean> {
  const key = displayNameKey(name);
  if (!key) return false;
  const snap = await db
    .collection('users')
    .select('displayName', 'status', 'suspectedBot', 'selfDeleted', 'deletedAt', DEMO_ACCOUNT_FIELD)
    .get();
  return snap.docs.some(
    (doc) => doc.id !== selfUid && displayNameKey(doc.get('displayName')) === key && holdsDisplayName(doc)
  );
}

/** The error shown when a name is taken. */
export const DISPLAY_NAME_TAKEN_ERROR = 'Someone already uses that name. Add a middle initial or a last name.';
