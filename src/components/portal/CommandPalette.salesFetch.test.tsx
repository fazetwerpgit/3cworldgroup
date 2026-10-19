// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const authState = vi.hoisted(() => ({
  user: { uid: 'admin-1', role: 'admin', status: 'active' } as Record<string, unknown>,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    hasPermission: () => true,
    isRole: (...roles: string[]) => roles.includes(authState.user.role as string),
  }),
}));
vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: { getIdToken: async () => 'token' } },
  db: {},
  isFirebaseConfigured: () => true,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { CommandPalette } from './CommandPalette';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<unknown>>;

function salesResponse(sales: unknown[]) {
  return { ok: true, json: async () => ({ sales, truncated: false }) };
}

async function render(open: boolean) {
  await act(async () => {
    root.render(<CommandPalette open={open} onOpenChange={() => {}} />);
  });
}

async function type(value: string) {
  const input = container.querySelector('input') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('CommandPalette sales fetch', () => {
  it('refetches on the next open when the first fetch is cancelled mid-flight', async () => {
    let resolveFirst!: (v: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    fetchMock.mockImplementation(async () => salesResponse([{ id: 's1', customerName: 'Zelda Quill', status: 'pending' }]));

    await render(true);
    await act(async () => {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
    // Esc before the list returns.
    await render(false);
    await act(async () => {
      resolveFirst(salesResponse([{ id: 's1', customerName: 'Zelda Quill', status: 'pending' }]));
    });

    await render(true);
    await act(async () => {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });
    await type('zelda');
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Zelda Quill'));
    });
  });

  it('searches beyond the 50 newest sales and caps only the rows shown', async () => {
    const sales = Array.from({ length: 120 }, (_, i) => ({
      id: `s${i}`,
      customerName: i === 110 ? 'Old Customer Marlow' : `Match Person ${i}`,
      status: 'approved',
    }));
    fetchMock.mockImplementation(async (url: string) => {
      const limit = Number(new URL(url, 'http://x').searchParams.get('limit'));
      return salesResponse(sales.slice(0, limit));
    });

    await render(true);
    await act(async () => {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
    await type('marlow');
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Old Customer Marlow'));
    });

    await type('match person');
    const saleLinks = [...container.querySelectorAll('li > button')].filter((el) =>
      el.textContent?.includes('Match Person')
    );
    expect(saleLinks.length).toBe(50);
  });
});
