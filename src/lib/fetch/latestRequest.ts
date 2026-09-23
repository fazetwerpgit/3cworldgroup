/**
 * For a panel that loads data for whichever record is open. Each `start()`
 * aborts the request before it and hands back a signal plus `isCurrent()`;
 * only the newest request stays current, and `cancel()` (the panel closed)
 * retires them all. A slow answer for rep A can then never land in rep B's
 * sheet after a quick close and reopen.
 */
export function latestRequest() {
  let seq = 0;
  let controller: AbortController | null = null;
  return {
    start() {
      controller?.abort();
      const own = new AbortController();
      controller = own;
      const id = ++seq;
      return { signal: own.signal, isCurrent: () => id === seq };
    },
    cancel() {
      controller?.abort();
      controller = null;
      seq += 1;
    },
  };
}
