// @vitest-environment jsdom
//
// One persistent rep shell: RepShellHost mounts the chrome once for every rep
// path, and each page's <RepShell> only registers its task title, back link
// and permission gate. A tab switch must not remount the bars, reopen the chat
// listeners or re-fire presence.
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pathname: '/portal/dashboard',
  topBarMounts: 0,
  tabBarMounts: 0,
  search: '',
  channelListeners: 0,
  unreadListeners: 0,
  presenceStarts: 0,
  lastTopBar: { task: undefined as string | undefined, back: undefined as { href: string; label: string } | undefined },
  permissionsSeen: [] as Array<string[] | undefined>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'rep-1' }, loading: false }) }));
vi.mock('@/contexts/ViewAsContext', () => ({
  useViewAs: () => ({ viewing: false }),
  isViewAsPath: () => false,
  ViewAsScope: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children, permissions }: { children: ReactNode; permissions?: string[] }) => {
    state.permissionsSeen.push(permissions);
    return <>{children}</>;
  },
}));
vi.mock('@/components/portal/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/portal/viewAs/ViewAsBanner', () => ({ ViewAsBanner: () => null }));
vi.mock('@/components/portal/admin-d/opsQueues', () => ({ useAdminNavCounts: () => ({}) }));
vi.mock('@/lib/app/isNativeApp', () => ({ useIsNativeApp: () => false }));
vi.mock('./PushNudge', () => ({ PushNudge: () => null }));
vi.mock('./RepBoot', () => ({ RepBoot: () => <div data-boot /> }));
vi.mock('@/hooks/usePresenceHeartbeat', () => ({
  usePresenceHeartbeat: () => {
    useEffect(() => {
      state.presenceStarts += 1;
    }, []);
  },
}));
vi.mock('@/hooks/chat/useChatChannels', () => ({
  useChatChannels: () => {
    useEffect(() => {
      state.channelListeners += 1;
    }, []);
    return { channels: [] };
  },
}));
vi.mock('@/hooks/chat/useChatUnread', () => ({
  useChatUnread: () => {
    useEffect(() => {
      state.unreadListeners += 1;
    }, []);
    return { anyUnread: false };
  },
}));
vi.mock('./RepTopBar', () => ({
  RepTopBar: ({ task, back }: { task?: string; back?: { href: string; label: string } }) => {
    useEffect(() => {
      state.topBarMounts += 1;
    }, []);
    state.lastTopBar = { task, back };
    return <header data-topbar data-task={task ?? ''} />;
  },
}));
// Tab data prefetch has its own tests (tabPrefetch.test.ts).
vi.mock('./useTabPrefetch', () => ({ useTabPrefetch: () => undefined }));
vi.mock('./RepTabBar', () => ({
  RepTabBar: () => {
    useEffect(() => {
      state.tabBarMounts += 1;
    }, []);
    return <nav data-tabbar />;
  },
}));

import { RepShell, RepShellHost, pickRepShellConfig, useHideRepTabBar } from './RepShell';
import { isRepShellPath } from './repShellRoutes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(path: string, page: ReactNode) {
  state.pathname = path;
  act(() => {
    root.render(<RepShellHost>{page}</RepShellHost>);
  });
}

beforeEach(() => {
  state.search = '';
  state.topBarMounts = 0;
  state.tabBarMounts = 0;
  state.channelListeners = 0;
  state.unreadListeners = 0;
  state.presenceStarts = 0;
  state.permissionsSeen = [];
  state.lastTopBar = { task: undefined, back: undefined };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('isRepShellPath', () => {
  it('covers the rep sections and leaves sign in, sign up and other paths bare', () => {
    expect(isRepShellPath('/portal/dashboard')).toBe(true);
    expect(isRepShellPath('/portal/sales/abc/edit')).toBe(true);
    expect(isRepShellPath('/portal/admin/people')).toBe(true);
    expect(isRepShellPath('/portal')).toBe(false);
    expect(isRepShellPath('/portal/signup')).toBe(false);
    expect(isRepShellPath('/portal/links')).toBe(false);
    expect(isRepShellPath('/portal/solar')).toBe(true);
    // The deck is handed to a homeowner: no portal chrome.
    expect(isRepShellPath('/portal/solar/present')).toBe(false);
    expect(isRepShellPath('/careers')).toBe(false);
    expect(isRepShellPath(null)).toBe(false);
  });
});

describe('pickRepShellConfig', () => {
  it('lets the deepest, then the latest, registration name the page', () => {
    expect(pickRepShellConfig([])).toEqual({});
    expect(
      pickRepShellConfig([
        { depth: 1, order: 5, task: 'Layout' },
        { depth: 2, order: 1, task: 'Page', back: { href: '/x', label: 'X' } },
      ])
    ).toEqual({ task: 'Page', back: { href: '/x', label: 'X' } });
    expect(
      pickRepShellConfig([
        { depth: 1, order: 1, task: 'Old' },
        { depth: 1, order: 2, task: 'New' },
      ])
    ).toEqual({ task: 'New', back: undefined });
  });
});

describe('RepShellHost', () => {
  it('renders the chrome once and passes the page title and back link to the top bar', () => {
    render(
      '/portal/sales/new/bulk',
      <RepShell permissions={['sales:write']} task="Log several sales" back={{ href: '/portal/sales/new', label: 'Log Sale' }}>
        <p data-page>bulk</p>
      </RepShell>
    );
    expect(container.querySelectorAll('[data-topbar]')).toHaveLength(1);
    expect(container.querySelector('#rep-main [data-page]')).not.toBeNull();
    expect(state.lastTopBar).toEqual({ task: 'Log several sales', back: { href: '/portal/sales/new', label: 'Log Sale' } });
    expect(state.permissionsSeen).toContainEqual(['sales:write']);
  });

  it('keeps bars, listeners and presence mounted across tab switches', () => {
    render('/portal/dashboard', <RepShell key="dash"><p>home</p></RepShell>);
    render('/portal/sales/new', <RepShell key="new" task="Log a sale"><p>log</p></RepShell>);
    expect(state.lastTopBar.task).toBe('Log a sale');
    render('/portal/leaderboard', <RepShell key="board" permissions={['leaderboard:read']}><p>board</p></RepShell>);
    render('/portal/chat', <RepShell key="chat" permissions={['chat:read']}><p>chat</p></RepShell>);

    expect(state.topBarMounts).toBe(1);
    expect(state.tabBarMounts).toBe(1);
    expect(state.channelListeners).toBe(1);
    expect(state.unreadListeners).toBe(1);
    expect(state.presenceStarts).toBe(1);
    // The task title left with the Log sale page.
    expect(state.lastTopBar).toEqual({ task: undefined, back: undefined });
  });

  it('a page RepShell inside a layout RepShell names the page', () => {
    render(
      '/portal/training/abc',
      <RepShell permissions={['training:read']} task="Module" back={{ href: '/portal/learn?tab=training', label: 'Training' }}>
        <RepShell task="Inner">
          <p>module</p>
        </RepShell>
      </RepShell>
    );
    expect(state.lastTopBar.task).toBe('Inner');
    expect(state.lastTopBar.back).toBeUndefined();
  });

  it('lets a page hide the tab bar and brings it back when the page leaves', () => {
    function Composer() {
      useHideRepTabBar(true);
      return <p>thread</p>;
    }
    render('/portal/chat', <RepShell key="thread"><Composer /></RepShell>);
    expect(container.querySelector('[data-tabbar]')).toBeNull();
    render('/portal/dashboard', <RepShell key="dash"><p>home</p></RepShell>);
    expect(container.querySelector('[data-tabbar]')).not.toBeNull();
  });

  it('renders non-rep paths bare', () => {
    render('/portal', <p data-login>login</p>);
    expect(container.querySelector('[data-topbar]')).toBeNull();
    expect(container.querySelector('[data-login]')).not.toBeNull();
  });

  it('a RepShell outside the host still mounts its own chrome', () => {
    state.pathname = '/portal/dashboard';
    act(() => {
      root.render(
        <RepShell task="Alone">
          <p>x</p>
        </RepShell>
      );
    });
    expect(container.querySelectorAll('[data-topbar]')).toHaveLength(1);
    expect(state.lastTopBar.task).toBe('Alone');
  });
});

describe('main scroll memory', () => {
  const scrollTops = new WeakMap<Element, number>();
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTops.get(this) ?? 0;
      },
      set(value: number) {
        scrollTops.set(this, value);
      },
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(Element.prototype, 'scrollTop', original);
  });

  function main() {
    return container.querySelector('#rep-main') as HTMLElement;
  }

  function scrollTo(top: number) {
    act(() => {
      main().scrollTop = top;
      main().dispatchEvent(new Event('scroll'));
    });
  }

  it('opens a new page at the top and restores a page on Back', () => {
    render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
    scrollTo(640);

    render('/portal/sales/abc', <RepShell key="sale"><p>sale</p></RepShell>);
    expect(main().scrollTop).toBe(0);
    scrollTo(120);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
    expect(main().scrollTop).toBe(640);

    // A fresh push to a page seen before still opens at the top.
    render('/portal/sales/abc', <RepShell key="sale"><p>sale</p></RepShell>);
    expect(main().scrollTop).toBe(0);
  });

  it('forgets a Back that did not change the page once it settles', () => {
    vi.useFakeTimers();
    try {
      render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
      scrollTo(300);
      render('/portal/sales/abc', <RepShell key="sale"><p>sale</p></RepShell>);
      // Same-path popstate (e.g. a hash or a no-op history entry): no navigation.
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      // The next ordinary tap opens at the top, not at the remembered spot.
      render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
      expect(main().scrollTop).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keys the spot on the path only: a same-path query change (router.replace) keeps it', () => {
    render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
    scrollTo(500);
    // e.g. the Sales month moving into the URL with router.replace / replaceState.
    state.search = 'month=2026-09';
    render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
    expect(main().scrollTop).toBe(500);
    // Away and Back: the path's spot comes back whatever the query was.
    render('/portal/sales/abc', <RepShell key="sale"><p>sale</p></RepShell>);
    expect(main().scrollTop).toBe(0);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    state.search = '';
    render('/portal/sales', <RepShell key="sales"><p>sales</p></RepShell>);
    expect(main().scrollTop).toBe(500);
  });
});
