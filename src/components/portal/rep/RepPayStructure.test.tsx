// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepPayStructure } from './RepPayStructure';

const auth = { user: { uid: 'admin-1' }, isRole: (role: string) => role === 'admin' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TIERS = [
  { fieldRole: 'entry_rep', baseRate: 10 },
  { fieldRole: 'ibo_level_1', baseRate: 20 },
  { fieldRole: 'ibo_level_4', baseRate: 30 },
];

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    new Response(
      JSON.stringify(
        init?.method === 'PUT' ? { success: true } : { tiers: TIERS, scope: 'all', updatedAt: null, updatedByName: null },
      ),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(label: string) {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`No ${label} button`);
  return found;
}

describe('RepPayStructure (all tiers)', () => {
  it('hides IBO tiers but keeps them in the saved tiers', async () => {
    await act(async () => root.render(<RepPayStructure />));
    await flush();
    expect(container.textContent).not.toMatch(/IBO/i);

    act(() => button('Edit rates').click());
    expect(container.textContent).not.toMatch(/IBO/i);
    await act(async () => button('Save rates').click());
    await flush();

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
    expect(JSON.parse((put![1] as RequestInit).body as string).tiers).toEqual(TIERS);
  });
});
