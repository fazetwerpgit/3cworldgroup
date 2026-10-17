// @vitest-environment jsdom
//
// Stale-while-revalidate for the sales list: a revisit paints the last copy
// at once, a background fetch replaces it, and a copy never crosses users.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { uid: 'rep-1' } as { uid: string } | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));

import { useSales } from './useSales';
import { setDataCacheOwner } from '@/lib/cache/dataCache';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof useSales>;
const FILTERS = { limit: 500, salesRepId: 'rep-1' };

let container: HTMLDivElement;
let root: Root;
let renders: Hook[] = [];

function Harness({ seed }: { seed: typeof FILTERS }) {
  const hook = useSales(seed);
  renders.push(hook);
  useEffect(() => {
    void hook.fetchSales(seed, { background: hook.seeded });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, like the page
  }, []);
  return null;
}

function respond(sales: Array<{ id: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ sales, truncated: false }) }))
  );
}

async function mount() {
  renders = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness seed={FILTERS} />));
}

async function unmount() {
  await act(async () => root.unmount());
  container.remove();
}

beforeEach(() => {
  auth.user = { uid: 'rep-1' };
  setDataCacheOwner('rep-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setDataCacheOwner(null);
});

describe('useSales cache', () => {
  it('first visit starts empty; a revisit paints the cached list, then revalidates', async () => {
    respond([{ id: 'a' }]);
    await mount();
    expect(renders[0].seeded).toBe(false);
    expect(renders[0].sales).toEqual([]);
    expect(renders.at(-1)!.sales).toEqual([{ id: 'a' }]);
    await unmount();

    respond([{ id: 'a' }, { id: 'b' }]);
    await mount();
    // The very first render already has last visit's list, and no loading flag.
    expect(renders[0].seeded).toBe(true);
    expect(renders[0].sales).toEqual([{ id: 'a' }]);
    expect(renders.every((hook) => !hook.loading)).toBe(true);
    // The background fetch replaced it.
    expect(renders.at(-1)!.sales).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('a background failure keeps the cached list and reports the error', async () => {
    respond([{ id: 'a' }]);
    await mount();
    await unmount();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'down' }) })));
    await mount();
    expect(renders.at(-1)!.sales).toEqual([{ id: 'a' }]);
    expect(renders.at(-1)!.error).toBe('down');
    await unmount();
  });

  it('never shows one user’s list to the next user, after sign-out or a switch', async () => {
    respond([{ id: 'owner-sale' }]);
    await mount();
    await unmount();

    // Sign-out, then a different account on the same phone.
    setDataCacheOwner(null);
    setDataCacheOwner('rep-2');
    auth.user = { uid: 'rep-2' };
    respond([]);
    await mount();
    expect(renders[0].seeded).toBe(false);
    expect(renders.every((hook) => hook.sales.length === 0)).toBe(true);
    await unmount();
  });
});
