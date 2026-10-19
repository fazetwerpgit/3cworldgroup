// Scroll-to-top for the portal's own scroller. On phones the rep shell's
// <main id="rep-main"> scrolls, not the window, so neither the iOS status-bar
// tap nor window.scrollTo reaches it. Used by the tab bar (tap the current tab)
// and the shell's `scrollToTop` bridge message (status-bar tap).

export const REP_SCROLLER_ID = 'rep-main';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Smoothly scrolls the page's scroller (or the window) to the top. Returns false when already there. */
export function scrollPageToTop(): boolean {
  if (typeof document === 'undefined') return false;
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const main = document.getElementById(REP_SCROLLER_ID);
  if (main && main.scrollHeight > main.clientHeight && main.scrollTop > 0) {
    main.scrollTo({ top: 0, behavior });
    return true;
  }
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollTop > 0) {
    window.scrollTo({ top: 0, behavior });
    return true;
  }
  return false;
}
