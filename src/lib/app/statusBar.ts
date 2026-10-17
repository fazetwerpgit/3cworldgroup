import { isNativeApp } from './isNativeApp';
import { postToNative, type StatusBarStyle } from './bridge';

// In the 3C iOS app, keep the iOS status bar readable over the page
// (BRIDGE.md statusBar). The portal's theme is the `dark` class on <body>
// (ThemeContext): dark page -> 'light' (white) text; without it the old light
// chrome (white .portal-shell-header) shows -> 'dark' (black) text.
// Never installed on the web.

/** The status bar style for the current page theme. */
export function statusBarStyleFor(body: Pick<HTMLElement, 'classList'> | null | undefined): StatusBarStyle {
  return body?.classList.contains('dark') ? 'light' : 'dark';
}

let installed = false;

/**
 * Sends the style now and again whenever <body>'s class changes it. Inside the
 * app only; idempotent. Returns the uninstall.
 */
export function installStatusBarSync(): () => void {
  if (installed || typeof document === 'undefined' || !isNativeApp()) return () => {};
  installed = true;

  let last: StatusBarStyle | null = null;
  const sync = () => {
    const style = statusBarStyleFor(document.body);
    if (style === last) return;
    last = style;
    postToNative({ type: 'statusBar', style });
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  return () => {
    observer.disconnect();
    installed = false;
  };
}
