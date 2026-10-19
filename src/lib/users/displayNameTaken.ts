// Owner's call (10/19): nobody may use another user's exact name. "Exact" ignores
// case and spacing ("jane  DOE" matches "Jane Doe"), nothing else: real people
// can share a first name, but an exact copy is how someone poses as a teammate
// in chat and on the Board. Checked everywhere a name is set (profile edit,
// admin edit and approval, website onboarding; signup is flagged for the admin
// because the client creates that doc directly).

/** The comparison key for a display name: trimmed, inner spaces collapsed, lower case. */
export function displayNameKey(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

interface UsersDb {
  collection(path: string): {
    select(...fields: string[]): { get(): Promise<{ docs: Array<{ id: string; get(field: string): unknown }> }> };
  };
}

/** Whether another user (any status) already has this exact name. */
export async function isDisplayNameTaken(db: UsersDb, name: string, selfUid?: string | null): Promise<boolean> {
  const key = displayNameKey(name);
  if (!key) return false;
  const snap = await db.collection('users').select('displayName').get();
  return snap.docs.some((doc) => doc.id !== selfUid && displayNameKey(doc.get('displayName')) === key);
}

/** The error shown when a name is taken. */
export const DISPLAY_NAME_TAKEN_ERROR = 'Someone already uses that name. Add a middle initial or a last name.';
