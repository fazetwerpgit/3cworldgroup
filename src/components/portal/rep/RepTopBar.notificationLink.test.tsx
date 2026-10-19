// @vitest-environment jsdom
//
// The rep bell opens a notification's link only when it is a same-origin
// /portal path, the same check the API and the admin bell use.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const notes = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/portal',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', displayName: 'Rep', fieldRole: 'entry_rep', status: 'active' }, signOut: vi.fn() }),
}));
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: notes.list,
    unreadCount: notes.list.length,
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
  push.mockClear();
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

function note(id: string, link: string) {
  return { id, title: `Title ${id}`, message: `Message ${id}`, link, read: false, createdAt: new Date() };
}

async function tap(title: string) {
  const bell = [...document.querySelectorAll('button')].find((b) =>
    (b.getAttribute('aria-label') ?? '').startsWith('Notifications')
  )!;
  await act(async () => bell.click());
  const row = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(title))!;
  await act(async () => row.click());
}

describe('RepTopBar notification links', () => {
  it('opens a /portal link', async () => {
    notes.list = [note('a', '/portal/sales?sale=1')];
    await act(async () => root.render(<RepTopBar />));
    await tap('Title a');
    expect(push).toHaveBeenCalledWith('/portal/sales?sale=1');
  });

  it.each(['javascript:alert(1)', '//evil.example', 'https://evil.example/portal', '/\\evil.example', '/onboard/x'])(
    'never opens %s',
    async (link) => {
      notes.list = [note('b', link)];
      await act(async () => root.render(<RepTopBar />));
      await tap('Title b');
      expect(push).not.toHaveBeenCalled();
    }
  );
});
