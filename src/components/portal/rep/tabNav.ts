// A tab-bar tap in the 3C iOS app, handed from RepTabBar to the shell's scroll
// memory (useMainScrollMemory): a tab opens where it was left, as a
// UITabBarController tab does, while any other navigation opens at the top.

let pendingTab: string | null = null;

/** RepTabBar: the next navigation to `href` came from the tab bar. */
export function markTabNavigation(href: string): void {
  pendingTab = href;
}

/**
 * The shell, on each path change: true when this path is the tab just tapped.
 * Consumes the mark either way, so it never carries over to a later tap.
 */
export function takeTabNavigation(pathname: string): boolean {
  const fromTab = pendingTab === pathname;
  pendingTab = null;
  return fromTab;
}
