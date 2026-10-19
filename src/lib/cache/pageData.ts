'use client';

// "Has the page's own data landed yet?" — so background traffic (the tab
// prefetch, presence, push health) waits for it instead of competing with it
// for a weak LTE link on a cold open.
//
// A screen that loads data on open holds the signal while its first load runs
// (holdPageData, released when it settles). Background work calls
// waitForPageData: it resolves once no hold is open and one was released after
// the wait began, or — on a screen that never holds — after `fallbackMs`, and
// never later than `maxMs`, so a hung request never parks it forever.

let holds = 0;
let lastReleaseAt = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of Array.from(listeners)) listener();
}

/** Marks a page's first data load as under way. Call the returned release once it settles (extra calls are no-ops). */
export function holdPageData(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    lastReleaseAt = Date.now();
    notify();
  };
}

/** True while some page's first data load is under way. */
export function isPageDataPending(): boolean {
  return holds > 0;
}

export interface WaitForPageDataOptions {
  /** A page that never holds: resolve this long after the wait began. */
  fallbackMs: number;
  /** Resolve by then whatever is still loading. */
  maxMs?: number;
  signal?: AbortSignal;
}

/** Resolves once the page's own data has landed (see the header). Never rejects; an aborted wait stays pending. */
export function waitForPageData({ fallbackMs, maxMs = 15_000, signal }: WaitForPageDataOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    const start = Date.now();
    let done = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const finish = () => {
      if (done) return;
      done = true;
      listeners.delete(check);
      for (const timer of timers) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      done = true;
      listeners.delete(check);
      for (const timer of timers) clearTimeout(timer);
    };
    function check() {
      if (done) return;
      const elapsed = Date.now() - start;
      if (elapsed >= maxMs) return finish();
      if (holds > 0) return;
      // The page's data landed while we waited, or just before (a fast or cached load).
      if (lastReleaseAt >= start - 1000 && lastReleaseAt > 0) return finish();
      if (elapsed >= fallbackMs) finish();
    }
    if (signal?.aborted) return;
    signal?.addEventListener('abort', abort);
    listeners.add(check);
    timers.push(setTimeout(check, fallbackMs), setTimeout(check, maxMs));
    check();
  });
}

/** Test hook: forget every hold. */
export function resetPageData(): void {
  holds = 0;
  lastReleaseAt = 0;
  listeners.clear();
}
