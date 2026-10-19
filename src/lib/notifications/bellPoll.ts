// The notification bell's polling schedule, kept pure so it can be tested
// without a browser.
//
// The bell used to fetch its full list every 30 s, forever, even in a
// background tab: about 42 Firestore reads and one function call per poll, so
// an admin tab left open all day cost ~40k reads. Now:
//   - a poll runs every BELL_POLL_MS (90 s), backing off to BELL_MAX_POLL_MS
//     after a failed poll;
//   - nothing runs while the page is hidden; becoming visible again refreshes
//     once (unless a poll ran very recently) and resumes the schedule;
//   - the poll itself is cheap (the hook asks for the unread count only and
//     re-reads the list only when the count changed).

export const BELL_POLL_MS = 90_000;
export const BELL_MAX_POLL_MS = 120_000;
/** Becoming visible within this long after a poll does not poll again. */
export const BELL_VISIBLE_REFRESH_MIN_MS = 15_000;

type VisibilityDoc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export interface BellPollerOptions {
  /** One poll. Resolves false (or throws) when it failed, which backs the schedule off. */
  tick: () => Promise<boolean>;
  doc?: VisibilityDoc | null;
  baseMs?: number;
  maxMs?: number;
  now?: () => number;
}

/** Starts polling (one poll now if visible). Returns a stop function. */
export function startBellPoller(options: BellPollerOptions): () => void {
  const { tick, doc = typeof document === 'undefined' ? null : document } = options;
  const baseMs = options.baseMs ?? BELL_POLL_MS;
  const maxMs = options.maxMs ?? BELL_MAX_POLL_MS;
  const now = options.now ?? Date.now;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;
  let lastRun = -Infinity;

  const hidden = () => doc?.visibilityState === 'hidden';
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (delay: number) => {
    clear();
    if (stopped || hidden()) return;
    timer = setTimeout(run, delay);
  };

  async function run() {
    timer = null;
    if (stopped || hidden() || running) return;
    running = true;
    lastRun = now();
    let ok = false;
    try {
      ok = await tick();
    } catch {
      ok = false;
    }
    running = false;
    schedule(ok ? baseMs : Math.min(baseMs * 2, maxMs));
  }

  const onVisibility = () => {
    if (stopped) return;
    if (hidden()) {
      clear();
      return;
    }
    const since = now() - lastRun;
    if (since >= BELL_VISIBLE_REFRESH_MIN_MS) void run();
    else schedule(baseMs - since);
  };

  doc?.addEventListener('visibilitychange', onVisibility);
  if (!hidden()) void run();

  return () => {
    stopped = true;
    clear();
    doc?.removeEventListener('visibilitychange', onVisibility);
  };
}
