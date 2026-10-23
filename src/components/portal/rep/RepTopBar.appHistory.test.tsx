// @vitest-environment jsdom
//
// In the 3C iOS app the desktop nav (an iPad in landscape) replaces the history
// entry like the phone tab bar, so the edge swipe never walks back through
// tabs. On the web its links stay plain pushes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/portal/dashboard' }));
const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
const app = vi.hoisted(() => ({ inApp: false }));
vi.mock('@/lib/app/isNativeApp', () => ({ isNativeApp: () => app.inApp, useIsNativeApp: () => app.inApp }));
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => {
    const { href, replace, children, className, onClick } = props;
    return (
      <a
        href={href as string}
        className={className as string}
        onClick={onClick as React.MouseEventHandler}
        data-replace={replace ? 'true' : 'false'}
      >
        {children as React.ReactNode}
      </a>
    );
  },
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, signOut: vi.fn() }),
}));
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    clearAll: vi.fn(),
  }),
}));
vi.mock('@/components/portal/NavSheet', () => ({
  NavGroupsList: () => null,
  NavSheet: () => null,
  useNavAccess: () => ({ canAccess: () => true, sheetGroups: () => [] }),
}));

import { RepTopBar } from './RepTopBar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  auth.user = { uid: 'r1', displayName: 'Fiber Rep', fieldRole: 'entry_rep', status: 'active' };
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function deskLinks(inApp: boolean) {
  app.inApp = inApp;
  await act(async () => root.render(<RepTopBar />));
  const nav = [...container.querySelectorAll<HTMLAnchorElement>('ul a')];
  const cta = container.querySelector<HTMLAnchorElement>('a[href="/portal/sales/new"]');
  return { nav, cta };
}

describe('RepTopBar desktop nav history', () => {
  it('replaces the history entry inside the app', async () => {
    const { nav, cta } = await deskLinks(true);
    expect(nav.length).toBeGreaterThan(2);
    for (const link of nav) expect(link.dataset.replace).toBe('true');
    expect(cta?.dataset.replace).toBe('true');
  });

  it('keeps plain links on the web', async () => {
    const { nav, cta } = await deskLinks(false);
    expect(nav.length).toBeGreaterThan(2);
    for (const link of nav) expect(link.dataset.replace).toBe('false');
    expect(cta?.dataset.replace).toBe('false');
  });
});
