// Pull to refresh for the rep shell's <main> scroller in the iOS app (the
// shell's own pull to refresh is off). The finger's travel is damped into a
// pull distance that eases toward PULL_MAX, so the content never runs away
// from the finger; past PULL_THRESHOLD a release refreshes.

/** How far the content can be pulled down, in px. */
export const PULL_MAX = 120;
/** Pulled this far (after damping) and let go: refresh. About 110px of finger travel. */
export const PULL_THRESHOLD = 72;
/** Where the content rests while the refresh runs. */
export const PULL_HOLD = 56;
/** Finger travel before the gesture is read as a pull or a scroll. */
export const PULL_DECIDE_PX = 8;

/** The damped pull distance for `travel` px of finger travel down. 0 for any upward travel. */
export function pullDistance(travel: number): number {
  if (travel <= 0) return 0;
  return PULL_MAX * (1 - Math.exp(-travel / PULL_MAX));
}

/** 0..1 toward the release point, for the indicator. */
export function pullProgress(distance: number): number {
  return Math.min(1, Math.max(0, distance / PULL_THRESHOLD));
}

/** Whether letting go at this pull distance refreshes. */
export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD;
}

/**
 * Reads the first real move of a touch that began with the scroller at the
 * top: 'pull' for a mostly-downward move, 'scroll' for anything else, or null
 * while the finger has not travelled far enough to tell.
 */
export function readPullIntent(dx: number, dy: number): 'pull' | 'scroll' | null {
  if (Math.abs(dx) < PULL_DECIDE_PX && Math.abs(dy) < PULL_DECIDE_PX) return null;
  return dy > 0 && dy > Math.abs(dx) ? 'pull' : 'scroll';
}
