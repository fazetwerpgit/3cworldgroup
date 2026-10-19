// @vitest-environment jsdom
//
// The unread badge after a tap: only notifications that were unread move it.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = { uid: 'rep-1' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user }) }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'tok') }));
// Keep the poller out of the way; the test drives fetchNotifications itself.
vi.mock('@/lib/cache/pageData', () => ({
  PAGE_DATA_FALLBACK_MS: 0,
  waitForPageData: () => new Promise(() => {}),
}));
vi.mock('@/lib/notifications/bellPoll', () => ({ startBellPoller: () => () => {} }));

import { useNotifications } from './useNotifications';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof useNotifications>;
const ctx: { current: Hook | null } = { current: null };
function Probe() {
  const value = useNotifications();
  useEffect(() => {
    ctx.current = value;
  });
  return null;
}

const list = [
  { id: 'a', read: false, title: 'A', message: '', type: 'general', createdAt: '' },
  { id: 'b', read: false, title: 'B', message: '', type: 'general', createdAt: '' },
  { id: 'old', read: true, title: 'Old', message: '', type: 'general', createdAt: '' },
];

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
  init?.method === 'PUT'
    ? new Response('{}')
    : new Response(JSON.stringify({ notifications: list, unreadCount: 2 }))
);

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
  await act(async () => {
    await ctx.current!.fetchNotifications();
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe('useNotifications markAsRead', () => {
  it('leaves the badge alone when the tapped notification was already read', async () => {
    expect(ctx.current!.unreadCount).toBe(2);
    await act(async () => {
      await ctx.current!.markAsRead(['old']);
    });
    expect(ctx.current!.unreadCount).toBe(2);
  });

  it('drops the badge by the unread ones only', async () => {
    await act(async () => {
      await ctx.current!.markAsRead(['a', 'old']);
    });
    expect(ctx.current!.unreadCount).toBe(1);
    expect(ctx.current!.notifications.find((n) => n.id === 'a')?.read).toBe(true);
    // Tapping the same one again (now read) does not move it.
    await act(async () => {
      await ctx.current!.markAsRead(['a']);
    });
    expect(ctx.current!.unreadCount).toBe(1);
  });
});
