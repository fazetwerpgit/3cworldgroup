'use client';

// The rep's own dashboard, kept on the device between app opens, so a cold
// open paints the last numbers at once (with a quiet "Updating" note) while
// the fresh read runs, instead of holding the splash for 8 API calls on LTE.
//
// Isolation (owners see financials that reps must never see):
// - One entry, keyed by the signed-in account's uid and a version. It is read
//   and written only when the dashboard's subject IS the signed-in account
//   (never under "View as rep"), and a read checks the uid stored inside too.
// - Writing it removes every other account's entry; sign-out removes all.
// - It holds the rep dashboard's own sections only (useRepDashboard: own
//   sales, own comp-plan slice, own standing). Never the owner summary.
// - Too old (SNAPSHOT_MAX_AGE_MS), another version, or unreadable: ignored.

import { auth } from '@/lib/firebase/config';

export const DASHBOARD_SNAPSHOT_VERSION = 1;
export const SNAPSHOT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Never store more than this (characters of JSON); a huge book just skips the snapshot. */
const SNAPSHOT_MAX_CHARS = 1_500_000;

const PREFIX = '3c:dash:';
const keyFor = (uid: string) => `${PREFIX}v${DASHBOARD_SNAPSHOT_VERSION}:${uid}`;

type Stored = { v: number; uid: string; at: number; value: unknown };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// JSON with Dates and Maps kept (the book carries sale dates and a Map of carrier orders).
function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key];
  if (raw instanceof Date) return { __t: 'd', v: raw.getTime() };
  if (raw instanceof Map) return { __t: 'm', v: Array.from(raw.entries()) };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__t' in value) {
    const tagged = value as { __t: unknown; v: unknown };
    if (tagged.__t === 'd' && typeof tagged.v === 'number') return new Date(tagged.v);
    if (tagged.__t === 'm' && Array.isArray(tagged.v)) return new Map(tagged.v as Array<[unknown, unknown]>);
  }
  return value;
}

/** True when `uid` is the account signed in on this device (not a rep viewed as). */
export function isSignedInAccount(uid: string | null | undefined): uid is string {
  return !!uid && auth?.currentUser?.uid === uid;
}

function removeEntries(keep?: string): void {
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX) && key !== keep) store.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was kept either.
  }
}

/** The last dashboard this account saw on this device, or undefined. */
export function readDashboardSnapshot<T>(uid: string | null | undefined): { value: T; at: number } | undefined {
  if (!isSignedInAccount(uid)) return undefined;
  const store = storage();
  if (!store) return undefined;
  try {
    const text = store.getItem(keyFor(uid));
    if (!text) return undefined;
    const stored = JSON.parse(text, reviver) as Stored;
    if (stored?.v !== DASHBOARD_SNAPSHOT_VERSION || stored.uid !== uid) return undefined;
    if (typeof stored.at !== 'number' || Date.now() - stored.at > SNAPSHOT_MAX_AGE_MS) return undefined;
    if (!stored.value || typeof stored.value !== 'object') return undefined;
    return { value: stored.value as T, at: stored.at };
  } catch {
    return undefined;
  }
}

/** Keeps this account's dashboard on the device (and drops any other account's). */
export function writeDashboardSnapshot(uid: string | null | undefined, value: unknown, at: number): void {
  if (!isSignedInAccount(uid)) return;
  const store = storage();
  if (!store) return;
  const key = keyFor(uid);
  removeEntries(key);
  try {
    const text = JSON.stringify({ v: DASHBOARD_SNAPSHOT_VERSION, uid, at, value } satisfies Stored, replacer);
    if (text.length > SNAPSHOT_MAX_CHARS) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, text);
  } catch {
    // Quota or blocked storage: the next open just loads as before.
  }
}

/** Sign-out (or the session ended): no dashboard stays on the device. */
export function clearDashboardSnapshots(): void {
  removeEntries();
}
