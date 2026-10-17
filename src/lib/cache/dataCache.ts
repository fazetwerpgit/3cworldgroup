// A small in-memory, module-level cache for portal reads, so revisiting a
// screen shows what it showed last time at once while the hook refreshes it in
// the background (stale-while-revalidate).
//
// Isolation rules (owners see financials that reps must never see):
// - The cache belongs to one signed-in Firebase account (the "owner" set by
//   AuthContext). Any change of account, and sign-out, empties it.
// - With no account set nothing is read or written.
// - Every entry is also keyed by the subject uid the screen shows (the owner's
//   own uid, or the rep's under "View as rep"), so the owner's own numbers are
//   never served as a rep's, or the other way round.
// - It lives in memory only: a reload starts empty, nothing reaches storage.

type Entry = { value: unknown; at: number };

let owner: string | null = null;
const entries = new Map<string, Entry>();

function fullKey(subject: string, key: string): string {
  return `${owner}\u0000${subject}\u0000${key}`;
}

/** The signed-in account the cache belongs to. A different account (or null on sign-out) empties it. */
export function setDataCacheOwner(uid: string | null | undefined): void {
  const next = uid || null;
  if (next === owner) return;
  entries.clear();
  owner = next;
}

/** Empties the cache (sign-out, account switch). */
export function clearDataCache(): void {
  entries.clear();
}

/** The cached value for this subject and key, or undefined. */
export function readDataCache<T>(subject: string | null | undefined, key: string): T | undefined {
  if (!owner || !subject) return undefined;
  return entries.get(fullKey(subject, key))?.value as T | undefined;
}

/** Stores a value for this subject and key. A no-op with no signed-in account. */
export function writeDataCache<T>(subject: string | null | undefined, key: string, value: T): void {
  if (!owner || !subject) return;
  entries.set(fullKey(subject, key), { value, at: Date.now() });
}

/** Drops this subject's entries whose key starts with `prefix` (after a write that changes them). */
export function invalidateDataCache(subject: string | null | undefined, prefix: string): void {
  if (!owner || !subject) return;
  const start = fullKey(subject, prefix);
  for (const key of entries.keys()) {
    if (key.startsWith(start)) entries.delete(key);
  }
}
