// @vitest-environment jsdom
//
// A failed comp-plan fetch is an error the page can retry, never "no plan".
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', status: 'active' } }),
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));

import { useCompPlan, type CompPlanResult } from './useCompPlan';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const latest: { current: CompPlanResult | null } = { current: null };

function Harness() {
  const plan = useCompPlan();
  useEffect(() => {
    latest.current = plan;
  });
  return null;
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCompPlan', () => {
  it('flags a network failure as an error, then recovers on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(ok({ scope: 'own', rates: { tfiber: { 'tfiber-1gig': 130 } }, payDelayDays: 14 }));
    vi.stubGlobal('fetch', fetchMock);

    await mount();
    expect(latest.current).toMatchObject({ error: true, hasPlan: false, loading: false });

    await act(async () => latest.current!.retry());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(latest.current).toMatchObject({ error: false, hasPlan: true });
  });

  it('flags a server error the same way', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status: 500 })));
    await mount();
    expect(latest.current).toMatchObject({ error: true, hasPlan: false });
  });

  it('reads a real "no plan" answer as no plan, not an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ scope: 'own', rates: null, payDelayDays: 14 })));
    await mount();
    expect(latest.current).toMatchObject({ error: false, hasPlan: false });
  });
});
