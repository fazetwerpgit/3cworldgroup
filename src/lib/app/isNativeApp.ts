import { useSyncExternalStore } from 'react';

// Shell detection for the 3C Portal iOS app (docs/ios-app/SPEC.md A1).
//
// The Expo shell appends ` 3CPortalApp/<version>` to the WebView user agent and
// injects `window.__3C_APP__ = true` before the page loads. Either marker means
// "running inside the app". Every in-app behavior in the portal is gated on
// this helper; with neither marker present (any normal browser or the PWA) the
// portal behaves exactly as it did before the app existed.

/** The user-agent suffix the shell appends (leading space included). */
export const APP_UA_MARKER = ' 3CPortalApp/';

declare global {
  interface Window {
    __3C_APP__?: boolean;
  }
}

interface ShellWindowLike {
  __3C_APP__?: unknown;
  navigator?: { userAgent?: string };
}

/** True when a user-agent string carries the shell's ` 3CPortalApp/` suffix. */
export function isNativeAppUA(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && ua.includes(APP_UA_MARKER);
}

/** The shell version from the user agent (` 3CPortalApp/1.2.0` -> "1.2.0"), or null. */
export function nativeAppVersion(ua: string | null | undefined): string | null {
  if (!isNativeAppUA(ua)) return null;
  const rest = (ua as string).slice((ua as string).indexOf(APP_UA_MARKER) + APP_UA_MARKER.length);
  const version = rest.split(/\s/)[0];
  return version || null;
}

/**
 * True when this page runs inside the 3C Portal app. Always false on the
 * server. Safe to call from effects and event handlers; in render, prefer
 * useIsNativeApp() so server and client markup match during hydration.
 */
export function isNativeApp(win?: ShellWindowLike): boolean {
  const w: ShellWindowLike | undefined = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!w) return false;
  if (w.__3C_APP__ === true) return true;
  return isNativeAppUA(w.navigator?.userAgent);
}

const subscribe = () => () => {};

/**
 * React hook form of isNativeApp(). Server render and hydration read false (so
 * the markup matches the server's), then the client value takes over. On the
 * web it is false throughout, so nothing re-renders.
 */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(subscribe, () => isNativeApp(), () => false);
}
