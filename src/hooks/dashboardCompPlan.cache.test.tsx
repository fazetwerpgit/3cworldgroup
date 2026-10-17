// @vitest-environment jsdom
//
// Stale-while-revalidate for the dashboard and the comp plan: a revisit paints
// last time's numbers at once; a failed background refresh keeps them but says
// so ("as of"), and a stale plan never passes as current.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { uid: 'rep-1', status: 'active' } as { uid: string; status: string } | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));
vi.mock('@/hooks/useRefreshOnResume', () => ({ useRefreshOnResume: () => {} }));

import { useRepDashboard } from './useRepDashboard';
import { useCompPlan } from './useCompPlan';
import { setDataCacheOwner } from '@/lib/cache/dataCache';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function json(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

/** Every dashboard endpoint answers; `down` makes all of them fail. */
function respondDashboard(down = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (down) return json({ error: 'down' }, false);
      if (url.startsWith('/api/portal/sales/status')) return json({ scope: 'own', orders: [] });
      if (url.startsWith('/api/portal/sales')) return json({ sales: [{ id: 's1', status: 'approved' }] });
      if (url.startsWith('/api/portal/comp-plan')) return json({ scope: 'own', rates: { att: { p1: 100 } } });
      if (url.startsWith('/api/portal/leaderboard')) return json({ leaderboard: [], currentUser: null, totalRanked: 0 });
      if (url.startsWith('/api/portal/settings/weekly-challenge')) return json({ targetSales: 5 });
      if (url.startsWith('/api/portal/calls')) return json({ calls: [] });
      if (url.startsWith('/api/portal/onboarding')) return json({ items: [] });
      return json({ error: 'unexpected' }, false);
    })
  );
}

async function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(node));
}

async function unmount() {
  await act(async () => root.unmount());
  container.remove();
}

beforeEach(() => {
  auth.user = { uid: 'rep-1', status: 'active' };
  setDataCacheOwner('rep-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setDataCacheOwner(null);
});

describe('useRepDashboard cache', () => {
  type Dash = ReturnType<typeof useRepDashboard>;
  let renders: Dash[] = [];
  function Harness() {
    const dash = useRepDashboard();
    useEffect(() => {
      renders.push(dash);
    });
    return null;
  }

  it('a revisit paints the cached sections at once; a failed refresh keeps them with an "as of" time', async () => {
    respondDashboard();
    renders = [];
    await mount(<Harness />);
    expect(renders[0].book.status).toBe('loading');
    expect(renders.at(-1)!.book.status).toBe('ready');
    expect(renders.at(-1)!.staleAt).toBeNull();
    await unmount();

    // Revisit with the network down.
    respondDashboard(true);
    renders = [];
    await mount(<Harness />);
    const first = renders[0];
    expect(first.book.status).toBe('ready');
    expect(first.plan.status).toBe('ready');
    const last = renders.at(-1)!;
    // Still showing last time's numbers, flagged as not current.
    expect(last.book.status).toBe('ready');
    expect(typeof last.staleAt).toBe('number');
    await unmount();
  });
});

describe('useCompPlan cache', () => {
  type Plan = ReturnType<typeof useCompPlan>;
  let renders: Plan[] = [];
  function Harness() {
    const plan = useCompPlan();
    useEffect(() => {
      renders.push(plan);
    });
    return null;
  }

  it('a failed refresh of a cached plan raises the error flag instead of passing it off as current', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ scope: 'own', rates: { att: { p1: 100 } } })));
    renders = [];
    await mount(<Harness />);
    expect(renders.at(-1)!.hasPlan).toBe(true);
    expect(renders.at(-1)!.error).toBe(false);
    await unmount();

    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'down' }, false)));
    renders = [];
    await mount(<Harness />);
    // Paints the cached plan first (no skeleton)...
    expect(renders[0].hasPlan).toBe(true);
    expect(renders[0].loading).toBe(false);
    // ...then the failed refresh flags it.
    expect(renders.at(-1)!.error).toBe(true);
    expect(renders.at(-1)!.hasPlan).toBe(false);
    await unmount();
  });
});
