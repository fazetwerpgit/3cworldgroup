// A small in-memory, module-level cache for portal reads, so revisiting a
// screen shows what it showed last time at once while the hook refreshes it in
// the background (stale-while-revalidate).
//
// Isolation rules (owners see financials that reps must never see):
// - The cache belongs to one signed-in Firebase account (the "owner" set by
//   AuthContext). Any change of account, and sign-out, empties it and starts a
//   new generation: a fetch begun under the old account cannot write into the
//   new one (capture dataCacheGeneration() before fetching, pass it on write).
// - With no account set nothing is read or written.
// - Every entry is also keyed by the subject uid the screen shows (the owner's
//   own uid, or the rep's under "View as rep"), so the owner's own numbers are
//   never served as a rep's, or the other way round.
// - It lives in memory only: a reload starts empty, nothing reaches storage.
//
// Freshness: an entry older than DATA_CACHE_MAX_AGE_MS is a miss (the screen
// shows its skeleton and a fresh read). At most DATA_CACHE_MAX_ENTRIES are
// kept; the least recently used goes first.

export const DATA_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
export const DATA_CACHE_MAX_ENTRIES = 40;

export type DataCacheEntry<T> = { value: T; at: number };

let owner: string | null = null;
let generation = 0;
const entries = new Map<string, DataCacheEntry<unknown>>();
// Reads under way (a tab prefetch), so a screen opening mid-read waits for it
// instead of sending the same request again.
const inflight = new Map<string, Promise<unknown>>();

const SEP = '\u0000';

function fullKey(subject: string, key: string): string {
  return `${owner}${SEP}${subject}${SEP}${key}`;
}

/** The signed-in account the cache belongs to. A different account (or null on sign-out) empties it. */
export function setDataCacheOwner(uid: string | null | undefined): void {
  const next = uid || null;
  if (next === owner) return;
  entries.clear();
  inflight.clear();
  owner = next;
  generation += 1;
}

/** Bumps on every account change. Capture it when a fetch starts; pass it to writeDataCache. */
export function dataCacheGeneration(): number {
  return generation;
}

/** Empties the cache (and invalidates fetches in flight). */
export function clearDataCache(): void {
  entries.clear();
  inflight.clear();
  generation += 1;
}

/** The cached entry (value and when it was stored) if present and fresh, else undefined. */
export function readDataCacheEntry<T>(subject: string | null | undefined, key: string): DataCacheEntry<T> | undefined {
  if (!owner || !subject) return undefined;
  const id = fullKey(subject, key);
  const entry = entries.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.at > DATA_CACHE_MAX_AGE_MS) {
    entries.delete(id);
    return undefined;
  }
  // Most recently used moves to the end.
  entries.delete(id);
  entries.set(id, entry);
  return entry as DataCacheEntry<T>;
}

/** The cached value for this subject and key if present and fresh, else undefined. */
export function readDataCache<T>(subject: string | null | undefined, key: string): T | undefined {
  return readDataCacheEntry<T>(subject, key)?.value;
}

/**
 * Stores a value for this subject and key. A no-op with no signed-in account,
 * or when `gen` (captured at fetch start) is from an earlier account.
 * `at` is when the value was fetched (default now). A screen writing back a
 * local edit of data it fetched earlier passes that fetch's time, so the entry
 * never looks fresher than the server copy it came from.
 */
export function writeDataCache<T>(
  subject: string | null | undefined,
  key: string,
  value: T,
  gen?: number,
  at: number = Date.now()
): void {
  if (!owner || !subject) return;
  if (gen !== undefined && gen !== generation) return;
  const id = fullKey(subject, key);
  entries.delete(id);
  entries.set(id, { value, at });
  while (entries.size > DATA_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * Registers a read under way for this subject and key (see inflight above).
 * Returns the same promise. A no-op with no signed-in account.
 */
export function trackDataCacheRead<T>(subject: string | null | undefined, key: string, read: Promise<T>): Promise<T> {
  if (!owner || !subject) return read;
  const id = fullKey(subject, key);
  inflight.set(id, read);
  const done = () => {
    if (inflight.get(id) === read) inflight.delete(id);
  };
  read.then(done, done);
  return read;
}

/** True while a tracked read for this subject and key is under way. */
export function isDataCacheReadPending(subject: string | null | undefined, key: string): boolean {
  return !!owner && !!subject && inflight.has(fullKey(subject, key));
}

/** How recent a prefetched entry must be for a screen to use it instead of reading again. */
export const PREFETCH_FRESH_MS = 30_000;

/**
 * A screen about to read: if a tracked read for the same data is under way,
 * waits for it and returns its entry when it landed fresh (within
 * PREFETCH_FRESH_MS); otherwise undefined and the screen reads as usual.
 */
export async function awaitPendingDataCacheRead<T>(
  subject: string | null | undefined,
  key: string
): Promise<DataCacheEntry<T> | undefined> {
  if (!owner || !subject) return undefined;
  const pending = inflight.get(fullKey(subject, key));
  if (!pending) return undefined;
  await pending.catch(() => undefined);
  const entry = readDataCacheEntry<T>(subject, key);
  return entry && Date.now() - entry.at <= PREFETCH_FRESH_MS ? entry : undefined;
}

/** Drops this subject's entries whose key starts with `prefix` (after a write that changes them). */
export function invalidateDataCache(subject: string | null | undefined, prefix: string): void {
  if (!owner || !subject) return;
  const start = fullKey(subject, prefix);
  for (const key of [...entries.keys()]) {
    if (key.startsWith(start)) entries.delete(key);
  }
}

/** Drops every subject's entries whose key starts with one of `prefixes`. */
export function invalidateAllSubjects(prefixes: string[]): void {
  for (const id of [...entries.keys()]) {
    const key = id.split(SEP)[2] ?? '';
    if (prefixes.some((prefix) => key.startsWith(prefix))) entries.delete(id);
  }
}

/**
 * A sale was created, edited, cancelled, deleted, re-dated, or a carrier
 * order assigned/linked: every cached view built from sales is out of date —
 * the lists, the dashboard, the boards and the carrier report. Dropped for
 * every subject in this account (the uid is accepted for call-site clarity),
 * since a manager's write changes reps' views too.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the uid documents whose write it was
export function invalidateAfterSaleWrite(_uid?: string | null): void {
  invalidateAllSubjects(['sales?', 'dashboard', 'leaderboard?', 'fiber-status']);
}

/** The comp plan changed: the cached plan, pay structure and the dashboard's pay figures are out of date. */
export function invalidateAfterCompPlanWrite(): void {
  invalidateAllSubjects(['comp-plan', 'dashboard', 'commission']);
}

/**
 * "3:07 PM" for a cached entry's "as of" note, or "Thu 3:07 PM" when it is
 * not from today (a bare time from before midnight would read as today's).
 */
export function cacheTimeLabel(at: number, now: Date = new Date()): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

// ---- revalidate (pull to refresh) ----
// Screens register their quiet refetch while mounted (useRevalidateOnPull,
// useRefreshOnResume). revalidateDataCache asks every one of them to refetch
// now, keeping what is on screen until the new data lands.

type Revalidator = () => unknown;
const revalidators = new Set<Revalidator>();

/** Registers a mounted screen's quiet refetch. Returns the unregister. */
const revalidatorWatchers = new Set<() => void>();

export function onRevalidateDataCache(revalidate: Revalidator): () => void {
  revalidators.add(revalidate);
  return () => {
    if (!revalidators.delete(revalidate)) return;
    for (const watch of Array.from(revalidatorWatchers)) watch();
  };
}

/** Called whenever a screen's revalidator is disposed (it left the screen). Returns the unsubscribe. */
export function onRevalidatorDisposed(watch: () => void): () => void {
  revalidatorWatchers.add(watch);
  return () => {
    revalidatorWatchers.delete(watch);
  };
}

/** True when some mounted screen can refetch (pull to refresh has something to do). */
export function hasDataRevalidators(): boolean {
  return revalidators.size > 0;
}

/**
 * Asks every mounted screen to refetch quietly. Resolves when the refetches
 * that return a promise have settled (failures included: each screen shows its
 * own error), or after `timeoutMs` so a hung request never pins the spinner.
 */
export async function revalidateDataCache({ timeoutMs = 10_000 }: { timeoutMs?: number } = {}): Promise<void> {
  const runs = [...revalidators].map((revalidate) => {
    try {
      return Promise.resolve(revalidate());
    } catch (error) {
      return Promise.reject(error);
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([Promise.allSettled(runs).then(() => undefined), timeout]);
  clearTimeout(timer);
}
