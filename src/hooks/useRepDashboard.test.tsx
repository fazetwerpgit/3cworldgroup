// @vitest-environment jsdom
//
// Reopening the app refreshes Home quietly: the numbers on screen stay until
// new ones land, never back to a skeleton, and a failed refresh keeps them.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepDashboard, type RepDashboardState } from './useRepDashboard';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', status: 'active' } }),
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let renders: RepDashboardState[] = [];
let failing = false;
let salesCount = 1;
let clock = 0;

function body(url: string): unknown {
  if (url.startsWith('/api/portal/sales/status')) return { orders: [] };
  if (url.startsWith('/api/portal/sales')) {
    return { sales: Array.from({ length: salesCount }, (_, i) => ({ id: `s${i}`, status: 'approved', products: [] })) };
  }
  if (url.startsWith('/api/portal/comp-plan')) return { scope: 'own', rates: null };
  if (url.startsWith('/api/portal/settings/weekly-challenge')) return { targetSales: 10 };
  if (url.startsWith('/api/portal/leaderboard')) return { leaderboard: [], currentUser: null, totalRanked: 0 };
  if (url.startsWith('/api/portal/calls')) return { calls: [] };
  throw new Error(`unexpected ${url}`);
}

function Probe() {
  renders.push(useRepDashboard());
  return null;
}

const settle = () => act(async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
});

async function resume() {
  clock += 61_000;
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
}

const statuses = (state: RepDashboardState) =>
  [state.book, state.plan, state.standing, state.challenge, state.calls].map((section) => section.status);
const bookSize = (state: RepDashboardState) => (state.book.status === 'ready' ? state.book.data.sales.length : null);

beforeEach(async () => {
  renders = [];
  failing = false;
  salesCount = 1;
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  vi.stubGlobal('fetch', async (url: string) =>
    failing
      ? { ok: false, status: 503, json: async () => ({ error: 'down' }) }
      : { ok: true, status: 200, json: async () => body(url) }
  );
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useRepDashboard resume refresh', () => {
  it('swaps in the new numbers without going back to loading', async () => {
    expect(statuses(renders.at(-1)!)).toEqual(['ready', 'ready', 'ready', 'ready', 'ready']);
    const before = renders.length;

    salesCount = 3;
    await resume();

    const during = renders.slice(before);
    expect(during.length).toBeGreaterThan(0);
    expect(during.flatMap(statuses).every((status) => status === 'ready')).toBe(true);
    expect(bookSize(renders.at(-1)!)).toBe(3);
  });

  it('keeps what is on screen when the refresh fails', async () => {
    const before = renders.length;
    failing = true;
    await resume();

    expect(renders.slice(before).flatMap(statuses).every((status) => status === 'ready')).toBe(true);
    expect(bookSize(renders.at(-1)!)).toBe(1);
  });

  it('waits a minute before refreshing again', async () => {
    salesCount = 2;
    clock += 30_000;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(bookSize(renders.at(-1)!)).toBe(1);
  });
});
