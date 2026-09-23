'use client';

import { useState } from 'react';

/** Above this many at once (a reconnect catching up), new messages just appear. */
const MAX_LIVE_BATCH = 3;

const EMPTY: ReadonlySet<string> = new Set();

export interface LiveAppendState {
  key: string | null;
  /** Every id seen so far in this thread; null until its first load has landed. */
  known: ReadonlySet<string> | null;
  /** Ids that arrived at the bottom while the thread was open. */
  fresh: ReadonlySet<string>;
}

export function initialLiveAppend(key: string | null): LiveAppendState {
  return { key, known: null, fresh: EMPTY };
}

/**
 * The next state for the thread's current ids; the same object when nothing
 * changed. The first loaded list, and anything that later lands above the
 * newest message already known (older history, a wider window), is history.
 * A few new ids below it arrived live.
 */
export function nextLiveAppend(
  state: LiveAppendState,
  ids: readonly string[],
  ready: boolean,
  key: string | null
): LiveAppendState {
  const current = state.key === key ? state : initialLiveAppend(key);
  if (!ready) return current;
  if (current.known === null) return { ...current, known: new Set(ids) };

  const known = current.known;
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length === 0) return current;

  let lastKnown = -1;
  ids.forEach((id, index) => {
    if (known.has(id)) lastKnown = index;
  });
  const tail = ids.filter((id, index) => index > lastKnown && !known.has(id));
  const fresh = tail.length > 0 && tail.length <= MAX_LIVE_BATCH ? new Set([...current.fresh, ...tail]) : current.fresh;
  return { key, known: new Set([...known, ...unknown]), fresh };
}

/**
 * Which messages in an open thread arrived live (sent or received while it was
 * on screen), so only those animate in; opening a thread or paging in history
 * never does. `ready` is false while the thread's messages are loading, and
 * `key` (the channel) starts a new thread.
 */
export function useLiveAppended(ids: readonly string[], ready: boolean, key: string | null): ReadonlySet<string> {
  const [state, setState] = useState(() => initialLiveAppend(key));
  const next = nextLiveAppend(state, ids, ready, key);
  if (next !== state) setState(next);
  return next.fresh;
}
