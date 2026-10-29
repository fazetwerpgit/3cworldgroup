// Resume/reconnect decisions for the installed PWA. iOS freezes a backgrounded
// web app; when it comes back, Firestore's watch stream is often a dead socket
// the SDK hasn't noticed yet, so onSnapshot listeners sit silent until a manual
// reload. Pure so the thresholds are testable.

// Not 'online': Firestore's own connectivity monitor already restarts its
// streams on that event, and cycling the network on top of it knocked
// AuthContext's profile getDoc (which retries on the same event) offline.
export type ResumeReason = 'visible' | 'pageshow';

// A quick glance away (notification centre, app switcher peek) keeps the socket
// alive; anything longer is treated as a suspension.
export const RESUME_HIDDEN_THRESHOLD_MS = 15_000;
// Never cycle the network more often than this (visibilitychange + pageshow +
// online can all fire for one resume).
export const RESUME_MIN_INTERVAL_MS = 5_000;

export function shouldCycleNetwork(input: {
  reason: ResumeReason;
  hiddenForMs: number;
  sinceLastCycleMs: number;
  online: boolean;
}): boolean {
  if (!input.online) return false;
  if (input.sinceLastCycleMs < RESUME_MIN_INTERVAL_MS) return false;
  // Restored from the back/forward cache: the old connection is gone for certain.
  if (input.reason === 'pageshow') return true;
  return input.hiddenForMs >= RESUME_HIDDEN_THRESHOLD_MS;
}

// How long "not synced" must persist before the chat shows it. Resumes that
// reconnect quickly never flash a banner.
export const CONNECTION_NOTICE_DELAY_MS = 1_500;

export type ConnectionNotice = 'offline' | 'reconnecting' | null;

/**
 * What the thread should say about the connection right now (before the
 * display delay). `fromCache` is the messages listener's snapshot metadata:
 * true means Firestore hasn't confirmed the view with the server yet.
 */
export function connectionNotice(input: { online: boolean; fromCache: boolean; rendered: boolean }): ConnectionNotice {
  if (!input.online) return 'offline';
  if (input.rendered && input.fromCache) return 'reconnecting';
  return null;
}

// A listener that keeps serving from the cache while the device is online and
// the page is visible has a dead watch target (seen in the iOS app's WebView on
// a cold open from a push: "Reconnecting…" never cleared). The watchdog
// resubscribes it after STALE_LISTENER_MS, backing off per attempt up to
// STALE_LISTENER_MAX_MS, so it never loops tightly. Coming back to the
// foreground or online while still stale resubscribes after a short grace
// (Firestore usually reconnects by itself within it).
export const STALE_LISTENER_MS = 15_000;
export const STALE_LISTENER_MAX_MS = 60_000;
export const STALE_LISTENER_NUDGE_GRACE_MS = 2_000;

export function staleListenerDelay(attempt: number): number {
  return Math.min(STALE_LISTENER_MAX_MS, STALE_LISTENER_MS * 2 ** attempt);
}

export interface StaleListenerWatchdog {
  /** Each snapshot's metadata.fromCache. */
  update: (fromCache: boolean) => void;
  /** The page became visible or the device came online. */
  nudge: () => void;
  dispose: () => void;
}

export function createStaleListenerWatchdog(options: {
  /** Tear down and resubscribe the listener. */
  resubscribe: () => void;
  online?: () => boolean;
  visible?: () => boolean;
}): StaleListenerWatchdog {
  const online = options.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const visible = options.visible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let stale = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay: number) => {
    clear();
    timer = setTimeout(fire, delay);
  };

  function fire() {
    timer = null;
    if (disposed || !stale) return;
    // Offline or in the background: wait for the nudge instead of polling.
    if (!online() || !visible()) return;
    attempt += 1;
    options.resubscribe();
    // Still stale after the resubscribe: try again, further apart each time.
    if (stale && !disposed && !timer) schedule(staleListenerDelay(attempt));
  }

  return {
    update(fromCache) {
      if (disposed) return;
      if (!fromCache) {
        stale = false;
        attempt = 0;
        clear();
        return;
      }
      stale = true;
      if (!timer) schedule(staleListenerDelay(attempt));
    },
    nudge() {
      if (disposed || !stale || !online() || !visible()) return;
      schedule(STALE_LISTENER_NUDGE_GRACE_MS);
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
