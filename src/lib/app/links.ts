import { isNativeApp } from './isNativeApp';
import { postToNative } from './bridge';
import { openNativeChatForHref } from './nativeChat';

// In-app link handling (SPEC A5). Inside the 3C iOS app there are no tabs:
// same-host links stay in the WebView, everything else (other sites, Meet,
// signed file links, tel:, mailto:, sms:) goes to the shell, which opens Safari,
// an in-app browser or the right iOS app. Never installed on the web.

const EXTERNAL_SCHEMES = new Set(['tel:', 'mailto:', 'sms:', 'facetime:', 'maps:', 'itms-apps:']);

export type LinkDecision =
  | { kind: 'internal'; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'ignore' };

/** Where a link should go inside the app, judged against the page's own URL. */
export function classifyLink(href: string | null | undefined, currentHref: string): LinkDecision {
  if (!href) return { kind: 'ignore' };
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return { kind: 'ignore' };
  let url: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    url = new URL(trimmed, current);
  } catch {
    return { kind: 'ignore' };
  }
  if (EXTERNAL_SCHEMES.has(url.protocol)) return { kind: 'external', url: url.href };
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'ignore' }; // blob:, data:, javascript:
  if (url.host === current.host) return { kind: 'internal', url: url.href };
  return { kind: 'external', url: url.href };
}

function go(decision: LinkDecision): boolean {
  if (decision.kind === 'internal') {
    window.location.assign(decision.url);
    return true;
  }
  if (decision.kind === 'external') return postToNative({ type: 'openExternal', url: decision.url });
  return false;
}

/**
 * A stand-in for the Window that window.open('', '_blank') returns, so the
 * open-a-blank-tab-then-point-it pattern (lib/forms/openAttachment.ts) works
 * in the app: setting location.href routes the URL instead of a new tab.
 */
function stubTab(): Window {
  const location = {
    set href(value: string) {
      go(classifyLink(value, window.location.href));
    },
    get href() {
      return 'about:blank';
    },
    assign(value: string) {
      go(classifyLink(value, window.location.href));
    },
    replace(value: string) {
      go(classifyLink(value, window.location.href));
    },
  };
  return { closed: false, opener: null, close() {}, focus() {}, location } as unknown as Window;
}

let installed = false;

/** Installs the click and window.open handlers. Inside the app only; idempotent. Returns the uninstall. */
export function installAppLinkHandling(): () => void {
  if (installed || typeof window === 'undefined' || !isNativeApp()) return () => {};
  installed = true;

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.hasAttribute('download')) return;
    const decision = classifyLink(anchor.getAttribute('href'), window.location.href);
    if (decision.kind === 'ignore') return;
    // A chat link opens the native chat screen when the shell has one.
    if (decision.kind === 'internal') {
      const route = inAppRoute(decision.url, window.location.href);
      if (route && openNativeChatForHref(route)) {
        event.preventDefault();
        return;
      }
    }
    // A plain same-tab internal link is left to Next.js / the browser.
    const newTab = anchor.target && anchor.target !== '_self';
    if (decision.kind === 'internal' && !newTab) return;
    event.preventDefault();
    go(decision);
  };
  document.addEventListener('click', onClick, true);

  const originalOpen = window.open;
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url === undefined ? '' : String(url);
    if (!href || href === 'about:blank') return stubTab();
    const decision = classifyLink(href, window.location.href);
    if (decision.kind === 'ignore') return originalOpen.call(window, url, target, features);
    go(decision);
    return stubTab();
  }) as typeof window.open;

  return () => {
    document.removeEventListener('click', onClick, true);
    window.open = originalOpen;
    installed = false;
  };
}

/**
 * The router path for a shell `navigate` URL: path, query and hash when it is a
 * portal page on this page's own origin, else null (the caller loads it the
 * old way, or drops it).
 */
export function inAppRoute(rawUrl: string, currentHref: string): string | null {
  let url: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    url = new URL(rawUrl, current);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  if (url.pathname !== '/portal' && !url.pathname.startsWith('/portal/')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Window event the app's navigate handler fires after a soft navigation; detail is the route. */
export const APP_NAVIGATE_EVENT = '3c:app-navigate';
