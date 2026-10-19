import { isNativeApp } from './isNativeApp';
import { postToNative, type StatusBarStyle } from './bridge';

// In the 3C iOS app, keep the iOS status bar readable over the page
// (BRIDGE.md statusBar). ThemeContext puts `portal-scope` (and `dark`) on
// <body>: dark page -> 'light' (white) text; `portal-scope` without `dark` is
// the old light chrome (white .portal-shell-header) -> 'dark' (black) text.
// Before the theme classes are there (AppBridgeHost's effect runs before
// ThemeProvider's, and pages outside the portal have none) it stays 'light',
// the shell's default, so the status bar never flashes dark.
// A light page inside the dark portal (the solar deck) overrides the theme
// with <body data-status-bar="dark"> while it is mounted (overrideStatusBar).
// Never installed on the web.

/** The <body> attribute a page sets to override the theme's status bar style. */
export const STATUS_BAR_OVERRIDE_ATTR = 'data-status-bar';

type BodyLike = Pick<HTMLElement, 'classList'> & Partial<Pick<HTMLElement, 'getAttribute'>>;

/** The status bar style for the current page theme ('light' until a theme is applied). */
export function statusBarStyleFor(body: BodyLike | null | undefined): StatusBarStyle {
  const override = body?.getAttribute?.(STATUS_BAR_OVERRIDE_ATTR);
  if (override === 'light' || override === 'dark') return override;
  if (!body?.classList.contains('portal-scope')) return 'light';
  return body.classList.contains('dark') ? 'light' : 'dark';
}

let installed = false;

/**
 * Sends the style now and again whenever <body>'s class or override changes it. Inside the
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
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', STATUS_BAR_OVERRIDE_ATTR] });

  return () => {
    observer.disconnect();
    installed = false;
  };
}

/**
 * Pins the status bar style while a page is mounted, over the theme's choice
 * (for a light page inside the dark portal). Harmless on the web: nothing
 * reads the attribute there. Returns the restore, for an effect cleanup.
 */
export function overrideStatusBar(style: StatusBarStyle): () => void {
  if (typeof document === 'undefined') return () => {};
  const body = document.body;
  body.setAttribute(STATUS_BAR_OVERRIDE_ATTR, style);
  return () => {
    if (body.getAttribute(STATUS_BAR_OVERRIDE_ATTR) === style) body.removeAttribute(STATUS_BAR_OVERRIDE_ATTR);
  };
}
