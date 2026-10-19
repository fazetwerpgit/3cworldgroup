// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  perms: new Set<string>(),
  viewing: null as unknown,
  prefetchTabs: vi.fn(),
  prefetchTab: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: fake.user, hasPermission: (p: string) => fake.perms.has(p) }),
}));
vi.mock('@/contexts/ViewAsContext', () => ({ useViewAs: () => ({ viewing: fake.viewing }) }));
vi.mock('@/lib/cache/tabPrefetch', () => ({ prefetchTabs: fake.prefetchTabs, prefetchTab: fake.prefetchTab }));

import { holdPageData, resetPageData } from '@/lib/cache/pageData';
import { TAB_PREFETCH_IDLE_MS, usePrefetchTabOnTouch, useTabPrefetch } from './useTabPrefetch';

/** The idle-frame stand-in where requestIdleCallback is missing (iOS WebKit; removed below). */
const IDLE_FRAME_MS = 200;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const touch: { handler: (href: string) => void } = { handler: () => {} };
const onTouch = (href: string) => touch.handler(href);

function Probe({ pathname }: { pathname: string | null }) {
  useTabPrefetch(pathname);
  const handler = usePrefetchTabOnTouch();
  useEffect(() => {
    touch.handler = handler;
  });
  return null;
}

async function render(pathname: string | null) {
  await act(async () => root.render(<Probe pathname={pathname} />));
}

/** Lets the dynamic import and its .then run. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    await vi.dynamicImportSettled();
  });
}

const rep = { uid: 'r1', status: 'active', fieldRole: 'entry_rep' };

/** A page that never holds: the fallback runs out, then the idle frame. */
async function waitOutFallback() {
  await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS));
  await act(async () => vi.advanceTimersByTime(IDLE_FRAME_MS));
  await flush();
}

const win = window as { requestIdleCallback?: unknown };
const realIdle = win.requestIdleCallback;

beforeEach(() => {
  vi.useFakeTimers();
  // Take the setTimeout path so the idle frame runs on the fake clock.
  win.requestIdleCallback = undefined;
  resetPageData();
  fake.user = { ...rep };
  fake.perms = new Set(['sales:read', 'leaderboard:read']);
  fake.viewing = null;
  fake.prefetchTabs.mockReset();
  fake.prefetchTab.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  win.requestIdleCallback = realIdle;
  resetPageData();
  vi.useRealTimers();
});

describe('useTabPrefetch', () => {
  it("on a page that never holds, warms the other tabs after the fallback and an idle frame, with the rep's context", async () => {
    await render('/portal/rep');
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS - 1));
    await flush();
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    await flush();
    // The fallback is up; the warm still waits for the idle frame.
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(IDLE_FRAME_MS));
    await flush();
    expect(fake.prefetchTabs).toHaveBeenCalledTimes(1);
    expect(fake.prefetchTabs).toHaveBeenCalledWith('/portal/rep', {
      uid: 'r1',
      active: true,
      canViewAll: false,
      canSales: true,
      canLeaderboard: true,
      management: false,
    });
  });

  it("warms as soon as the page's data lands, without waiting out the fallback", async () => {
    const release = holdPageData();
    await render('/portal/rep');
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS / 4));
    await flush();
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
    await act(async () => release());
    await act(async () => vi.advanceTimersByTime(IDLE_FRAME_MS));
    await flush();
    expect(fake.prefetchTabs).toHaveBeenCalledTimes(1);
    expect(fake.prefetchTabs).toHaveBeenCalledWith('/portal/rep', expect.objectContaining({ uid: 'r1', active: true }));
  });

  it("keeps waiting past the fallback while the page's own data is still loading", async () => {
    const release = holdPageData();
    await render('/portal/rep');
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS * 2));
    await act(async () => vi.advanceTimersByTime(IDLE_FRAME_MS));
    await flush();
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
    await act(async () => release());
    await act(async () => vi.advanceTimersByTime(IDLE_FRAME_MS));
    await flush();
    expect(fake.prefetchTabs).toHaveBeenCalledTimes(1);
  });

  it('starts the wait over on a new page and never warms for the page left behind', async () => {
    await render('/portal/rep');
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS / 2));
    await render('/portal/rep/sales');
    // The first page's fallback would have run out by now; its wait is gone.
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS / 2 + IDLE_FRAME_MS));
    await flush();
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
    await waitOutFallback();
    expect(fake.prefetchTabs.mock.calls.map((c) => c[0])).toEqual(['/portal/rep/sales']);
  });

  it('a page change after the wait but before the idle frame drops the old warm', async () => {
    await render('/portal/rep');
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS));
    await render('/portal/rep/sales');
    await waitOutFallback();
    expect(fake.prefetchTabs.mock.calls.map((c) => c[0])).toEqual(['/portal/rep/sales']);
  });

  it('does not warm after unmount, even if the chunk lands late', async () => {
    await render('/portal/rep');
    // The wait ends and the idle frame requests the chunk; unmount lands before it resolves.
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS));
    vi.advanceTimersByTime(IDLE_FRAME_MS);
    act(() => root.unmount());
    root = createRoot(host);
    await flush();
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
  });

  it('marks management and view-all from the role and permissions', async () => {
    fake.user = { uid: 'm1', status: 'active', role: 'admin' };
    fake.perms = new Set(['sales:read', 'sales:read:all', 'leaderboard:read']);
    await render('/portal/admin');
    await waitOutFallback();
    expect(fake.prefetchTabs).toHaveBeenCalledWith('/portal/admin', expect.objectContaining({ uid: 'm1', canViewAll: true, management: true }));
  });

  it('marks operations as management without view-all', async () => {
    fake.user = { uid: 'o1', status: 'active', role: 'operations' };
    fake.perms = new Set(['sales:read', 'leaderboard:read']);
    await render('/portal/admin');
    await waitOutFallback();
    expect(fake.prefetchTabs).toHaveBeenCalledWith('/portal/admin', expect.objectContaining({ uid: 'o1', canViewAll: false, management: true }));
  });

  it.each([
    ['signed out', () => (fake.user = null)],
    ['an owner viewing as a rep', () => (fake.viewing = { uid: 'r1' })],
    ['a hire still onboarding', () => (fake.user = { uid: 'r2', status: 'pending', fieldRole: 'entry_rep' })],
  ])('never warms for %s', async (_label, setup) => {
    setup();
    await render('/portal/rep');
    await act(async () => vi.advanceTimersByTime(TAB_PREFETCH_IDLE_MS * 2));
    await act(async () => vi.advanceTimersByTime(IDLE_FRAME_MS));
    await flush();
    onTouch('/portal/rep/sales');
    await flush();
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
    expect(fake.prefetchTab).not.toHaveBeenCalled();
  });

  it('passes an inactive account on as not active', async () => {
    fake.user = { uid: 'r3', status: 'inactive', fieldRole: 'entry_rep' };
    await render('/portal/rep');
    await waitOutFallback();
    expect(fake.prefetchTabs).toHaveBeenCalledWith('/portal/rep', expect.objectContaining({ active: false }));
  });
});

describe('usePrefetchTabOnTouch', () => {
  it("warms the touched tab's data right away, without waiting", async () => {
    await render('/portal/rep');
    onTouch('/portal/rep/leaderboard');
    await flush();
    expect(fake.prefetchTab).toHaveBeenCalledWith('/portal/rep/leaderboard', expect.objectContaining({ uid: 'r1' }));
    expect(fake.prefetchTabs).not.toHaveBeenCalled();
  });

  it('swallows a prefetch that throws', async () => {
    fake.prefetchTab.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    await render('/portal/rep');
    expect(() => onTouch('/portal/rep/sales')).not.toThrow();
    await flush();
    expect(fake.prefetchTab).toHaveBeenCalledTimes(1);
  });
});
