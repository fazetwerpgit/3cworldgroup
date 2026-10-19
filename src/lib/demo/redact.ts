import { randomBytes } from 'node:crypto';

// Demo accounts (users/{uid}.demoAccount === true: the App Store reviewer and
// Sam Demo) must never see who the real reps are. Every API response that
// carries OTHER people's identities runs through one redactor per response
// when the CALLER is a demo account:
//   - names become "Rep 1", "Rep 2", ... in the order they are first written
//     out (so a board's top row is Rep 1), stable within the response;
//   - uids become opaque ids that are new on every response (a random token
//     per redactor), so nothing can be joined across requests;
//   - photos and avatars are dropped.
// Counts, points and times stay. The caller's own row is left exactly as is.
// For anyone else the redactor is a pass-through, so routes call it always.

export interface DemoCaller {
  uid: string;
  demoAccount: boolean;
}

export interface DemoRedactor {
  /** True when the caller is a demo account and output is being rewritten. */
  readonly active: boolean;
  /** Whether `uid` is the caller (whose own data is never rewritten). */
  isCaller(uid: string | null | undefined): boolean;
  /** An opaque per-response id for someone else's uid; the caller's own uid as is. */
  id(uid: string | null | undefined): string;
  /** "Rep N" for someone else; the real name for the caller. */
  name(key: string | null | undefined, realName: string): string;
}

/** The fields a person row may carry a photo in; all are dropped for a demo caller. */
export const PHOTO_FIELDS = ['photoURL', 'photoUrl', 'avatarUrl', 'avatarURL', 'avatar', 'photo', 'image'] as const;

export function createDemoRedactor(caller: DemoCaller): DemoRedactor {
  if (!caller.demoAccount) {
    return {
      active: false,
      isCaller: (uid) => !!uid && uid === caller.uid,
      id: (uid) => uid ?? '',
      name: (_key, realName) => realName,
    };
  }
  const token = randomBytes(6).toString('hex');
  const aliases = new Map<string, number>();
  let next = 0;
  const aliasOf = (key: string | null | undefined): number => {
    // No key: someone we cannot tell apart, so a fresh alias each time.
    if (!key) return ++next;
    let n = aliases.get(key);
    if (n === undefined) {
      n = ++next;
      aliases.set(key, n);
    }
    return n;
  };
  return {
    active: true,
    isCaller: (uid) => !!uid && uid === caller.uid,
    id: (uid) => (uid && uid === caller.uid ? uid : `anon-${token}-${aliasOf(uid)}`),
    name: (key, realName) => (key && key === caller.uid ? realName : `Rep ${aliasOf(key)}`),
  };
}

/**
 * Rewrites person rows for a demo caller: `idKey` gets an opaque id, `nameKey`
 * a "Rep N" name, and photo fields are removed. The caller's own row (its
 * `idKey` equals the caller's uid) comes back untouched. Rows are rewritten in
 * order, so the first other person is Rep 1. Inactive redactor: rows as given.
 */
export function redactPeople<T extends object>(
  rows: readonly T[],
  redactor: DemoRedactor,
  keys: { idKey: keyof T & string; nameKey: keyof T & string }
): T[] {
  if (!redactor.active) return rows as T[];
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const raw = typeof record[keys.idKey] === 'string' ? (record[keys.idKey] as string) : '';
    if (redactor.isCaller(raw)) return row;
    // A row with no uid still gets ONE alias for both its name and its id.
    const key = raw || `\u0000${randomBytes(6).toString('hex')}`;
    const out: Record<string, unknown> = { ...record };
    const realName = typeof record[keys.nameKey] === 'string' ? (record[keys.nameKey] as string) : '';
    out[keys.nameKey] = redactor.name(key, realName);
    out[keys.idKey] = redactor.id(key);
    for (const field of PHOTO_FIELDS) delete out[field];
    return out as T;
  });
}
