// Resume/reconnect decisions for the installed PWA. iOS freezes a backgrounded
// web app; when it comes back, Firestore's watch stream is often a dead socket
// the SDK hasn't noticed yet, so onSnapshot listeners sit silent until a manual
// reload. Pure so the thresholds are testable.

export type ResumeReason = 'visible' | 'pageshow' | 'online';

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
  // Coming back online or restored from the back/forward cache: the old
  // connection is gone for certain.
  if (input.reason === 'online' || input.reason === 'pageshow') return true;
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
