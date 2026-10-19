// @vitest-environment jsdom
//
// The tab bar inside the 3C iOS app behaves like a UITabBar: selection haptic,
// replace (no tab history for the edge swipe), the current tab scrolls to the
// top, and a tab tap tells the shell to restore that tab's scroll position.
// On the web it stays a plain set of links.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ native: false, pathname: '/portal/sales' }));
const haptic = vi.hoisted(() => vi.fn());
const scrollTop = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/lib/app/isNativeApp', () => ({ isNativeApp: () => env.native, useIsNativeApp: () => env.native }));
vi.mock('@/lib/app/bridge', () => ({ nativeHaptic: haptic }));
vi.mock('@/lib/app/scrollToTop', () => ({ scrollPageToTop: scrollTop }));
vi.mock('next/navigation', () => ({ usePathname: () => env.pathname }));
vi.mock('next/link', () => ({
  default: ({
    href,
    replace,
    scroll,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean; scroll?: boolean }) => (
    <a href={href} data-replace={String(!!replace)} data-scroll={String(scroll)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'rep' } }) }));
vi.mock('@/contexts/ViewAsContext', () => ({ useViewAs: () => ({ viewing: false }) }));
vi.mock('@/components/portal/NavSheet', () => ({ useNavAccess: () => ({ canAccess: () => true }) }));
vi.mock('./useTabPrefetch', () => ({ usePrefetchTabOnTouch: () => () => {} }));
vi.mock('./BodyLayer', () => ({ BodyLayer: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { RepTabBar } from './RepTabBar';
import { takeTabNavigation } from './tabNav';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function tab(label: string): HTMLAnchorElement {
  const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.startsWith(label));
  if (!link) throw new Error(`no ${label} tab`);
  return link;
}

function click(link: HTMLAnchorElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  act(() => {
    link.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  haptic.mockClear();
  scrollTop.mockClear();
  takeTabNavigation('');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RepTabBar in the app', () => {
  beforeEach(() => {
    env.native = true;
    env.pathname = '/portal/sales';
    act(() => root.render(<RepTabBar />));
  });

  it('replaces instead of pushing and leaves the scroll to the shell', () => {
    expect(tab('Board').dataset.replace).toBe('true');
    expect(tab('Board').dataset.scroll).toBe('false');
  });

  it('a tap on another tab: selection haptic, and the shell restores that tab', () => {
    const event = click(tab('Board'));
    expect(event.defaultPrevented).toBe(false);
    expect(haptic).toHaveBeenCalledWith('selection');
    expect(takeTabNavigation('/portal/leaderboard')).toBe(true);
  });

  it('a tap on the tab you are on scrolls it to the top instead of navigating', () => {
    const event = click(tab('Sales'));
    expect(event.defaultPrevented).toBe(true);
    expect(scrollTop).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('selection');
  });
});

describe('RepTabBar on the web', () => {
  it('stays plain links: push, no haptic, no scroll handling', () => {
    env.native = false;
    env.pathname = '/portal/sales';
    act(() => root.render(<RepTabBar />));
    expect(tab('Board').dataset.replace).toBe('false');
    const event = click(tab('Sales'));
    expect(event.defaultPrevented).toBe(false);
    expect(haptic).not.toHaveBeenCalled();
    expect(scrollTop).not.toHaveBeenCalled();
  });
});
