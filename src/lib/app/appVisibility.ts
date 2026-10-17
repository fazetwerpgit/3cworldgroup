import { useSyncExternalStore } from 'react';
import { isNativeApp } from './isNativeApp';
import { onNativeMessage } from './bridge';

// Is the portal really on screen? (BRIDGE.md visible / resumed)
//
// In the 3C iOS app the WebView loads behind the splash, the Face ID lock and
// the privacy cover, so once-per-session reveals (useFirstReveal, useCountUp)
// would play unseen and spend their sessionStorage keys. Shells that know this
// set window.__3C_VISIBLE__ before content and send `visible` events; the
// motion hooks wait for true. On the web, and in older shells that never set
// the flag, the page counts as visible, so nothing changes there.

/** sessionStorage key prefixes of the once-per-session motion. */
export const SESSION_MOTION_PREFIXES = ['3c:reveal:', '3c:countup:'] as const;

/** True unless the app shell says the portal is hidden right now. */
export function isAppVisible(): boolean {
  if (typeof window === 'undefined' || !isNativeApp()) return true;
  return window.__3C_VISIBLE__ !== false;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !isNativeApp()) return () => {};
  return onNativeMessage((message) => {
    if (message.type === 'visible') onChange();
  });
}

/** React form of isAppVisible(): re-renders when the shell reports a change. */
export function useAppVisible(): boolean {
  return useSyncExternalStore(subscribe, isAppVisible, () => true);
}

/** Forgets which reveals / count-ups played, so they replay (after a long time away). */
export function clearSessionMotionKeys(storage: Storage | undefined = typeof window !== 'undefined' ? window.sessionStorage : undefined) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && SESSION_MOTION_PREFIXES.some((p) => key.startsWith(p))) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage blocked: nothing was remembered either.
  }
}

/**
 * In the app: when the shell reports a long time away (`resumed`), clear the
 * motion keys so reveals replay like a relaunched PWA. Returns the unsubscribe.
 */
export function installResumeMotionReset(): () => void {
  if (typeof window === 'undefined' || !isNativeApp()) return () => {};
  return onNativeMessage((message) => {
    if (message.type === 'resumed') clearSessionMotionKeys();
  });
}
