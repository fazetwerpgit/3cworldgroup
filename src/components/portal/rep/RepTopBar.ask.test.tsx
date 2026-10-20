// @vitest-environment jsdom
//
// Ask 3C is one labeled tap from the top bar on every rep page, for fiber,
// solar-only and dual (fiber + solar) reps alike. Not on the Ask page itself,
// not for a hire still onboarding, and not while the feature is off.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/portal/dashboard' }));
const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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

const REPS = {
  fiber: { uid: 'r1', displayName: 'Fiber Rep', fieldRole: 'entry_rep', status: 'active' },
  'solar-only': { uid: 'r2', displayName: 'Solar Rep', solarRole: 'entry_canvasser', status: 'active' },
  dual: { uid: 'r3', displayName: 'Dual Rep', fieldRole: 'entry_rep', solarRole: 'entry_canvasser', status: 'active' },
};

const PAGES = ['/portal/dashboard', '/portal/sales', '/portal/leaderboard', '/portal/chat', '/portal/solar', '/portal/forms', '/portal/learn'];

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubEnv('ASK_3C_ENABLED', 'true');
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
  vi.unstubAllEnvs();
});

async function askLink(user: Record<string, unknown>, pathname: string, task?: string) {
  auth.user = user;
  nav.pathname = pathname;
  await act(async () => root.render(<RepTopBar task={task} />));
  return container.querySelector<HTMLAnchorElement>('header a[href="/portal/ask"]');
}

describe('RepTopBar Ask 3C', () => {
  for (const [kind, user] of Object.entries(REPS)) {
    it.each(PAGES)(`is in the top bar for a ${kind} rep on %s`, async (pathname) => {
      const link = await askLink(user, pathname);
      expect(link).not.toBeNull();
      expect(link!.getAttribute('aria-label')).toBe('Ask 3C');
      // Labeled, not a bare icon.
      expect(link!.textContent).toContain('Ask');
    });

    it(`stays on a ${kind} rep's task pages (Log a sale)`, async () => {
      expect(await askLink(user, '/portal/sales/new', 'Log a sale')).not.toBeNull();
    });
  }

  it('is not on the Ask page itself', async () => {
    expect(await askLink(REPS.dual, '/portal/ask')).toBeNull();
  });

  it('is not shown to a hire still onboarding', async () => {
    expect(await askLink({ ...REPS.fiber, fieldRole: 'entry_level_rep', status: 'pending' }, '/portal/onboarding')).toBeNull();
  });

  it('is not shown while Ask 3C is off', async () => {
    vi.stubEnv('ASK_3C_ENABLED', '');
    expect(await askLink(REPS['solar-only'], '/portal/dashboard')).toBeNull();
  });
});
