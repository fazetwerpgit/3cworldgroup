import { isNativeApp } from './isNativeApp';
import { postToNative, type StatusBarStyle } from './bridge';

// In the 3C iOS app, keep the iOS status bar readable over the page
// (BRIDGE.md statusBar). ThemeContext puts `portal-scope` (and `dark`) on
// <body>: dark page -> 'light' (white) text; `portal-scope` without `dark` is
// the old light chrome (white .portal-shell-header) -> 'dark' (black) text.
// Before the theme classes are there (AppBridgeHost's effect runs before
// ThemeProvider's, and pages outside the portal have none) it stays 'light',
// the shell's default, so the status bar never flashes dark.
// Never installed on the web.

/** The status bar style for the current page theme ('light' until a theme is applied). */
export function statusBarStyleFor(body: Pick<HTMLElement, 'classList'> | null | undefined): StatusBarStyle {
  if (!body?.classList.contains('portal-scope')) return 'light';
  return body.classList.contains('dark') ? 'light' : 'dark';
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
