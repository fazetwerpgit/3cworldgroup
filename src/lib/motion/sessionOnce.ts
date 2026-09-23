// Once-per-session motion: a first reveal plays the first time a surface shows
// in this browser session, then never again (tab switches, remounts, refreshes
// of cached data). Reduced motion, or storage that throws, means no motion.

/** The browser can animate and the viewer has not asked for less motion. */
export function motionAllowed(): boolean {
  return (
    typeof window !== 'undefined' &&
    !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/** Whether `key`'s first-reveal motion should play now. Reads only. */
export function firstThisSession(key: string): boolean {
  if (!motionAllowed()) return false;
  try {
    return window.sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

/** `key` has played its first reveal this session. */
export function markPlayedThisSession(key: string) {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Storage blocked: nothing to remember it by, and nothing breaks.
  }
}
