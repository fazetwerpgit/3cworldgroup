// @vitest-environment jsdom
//
// Log sale's "Finish your sales": open drafts from 3C Doors list above the
// entry; picking one fills the sale and carries its draftId on submit; the x
// dismisses it through the API.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const createSale = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'r1', displayName: 'Wil Teasdale', email: 'w@x.com', status: 'active' } }),
}));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({ createSale, loading: false, error: null }),
  NO_SIGNAL_SALE_MESSAGE: 'No signal',
}));
vi.mock('@/hooks/useCompPlan', () => ({
  useCompPlan: () => ({ rates: { tfiber: { 'tfiber-1gig': 130 } }, hasPlan: true, loading: false }),
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token-1' }));

import { RepLogSale } from './RepLogSale';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Noon local time, so the sale date is the same day in any timezone the test runs in.
const SOLD_AT = new Date(2026, 9, 6, 12).getTime();
const DRAFT = {
  id: 'r1_sold-1',
  clientId: 'sold-1',
  address: '1 Main St, Springfield, MO',
  soldAt: SOLD_AT,
  customerName: 'Jane Doe',
  planId: 'tfiber-1gig',
  status: 'open',
  source: 'knock',
  houseId: null,
  knockId: null,
  campaignId: null,
  createdAt: SOLD_AT,
  updatedAt: SOLD_AT,
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: Mock;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RepLogSale />));
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label);

beforeEach(() => {
  window.sessionStorage.clear();
  createSale.mockReset();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/portal/sales/drafts' && !init?.method) {
      return new Response(JSON.stringify({ drafts: [DRAFT] }), { status: 200 });
    }
    if (url.startsWith('/api/portal/sales/drafts/') && init?.method === 'DELETE') {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ url: null }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Finish your sales', () => {
  it('lists open drafts with the address, name, sold day and source', async () => {
    await mount();
    const list = container.querySelector('[aria-labelledby="finish-h"]');
    expect(list?.textContent).toContain('Finish your sales · 1');
    expect(list?.textContent).toContain('1 Main St, Springfield, MO');
    expect(list?.textContent).toContain('Jane Doe · Sold Oct 6 · from 3C Doors');
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/sales/drafts', {
      headers: { Authorization: 'Bearer token-1' },
    });
  });

  it('fills the sale from the picked draft and sends its draftId on submit', async () => {
    createSale.mockResolvedValue({ sale: { id: 's1' }, duplicate: false });
    await mount();
    await act(async () => button('1 Main St, Springfield, MO')!.click());
    expect(button('1 Main St, Springfield, MO')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button('Enter manually')!.click());

    expect(container.querySelector<HTMLInputElement>('#customerAddress')!.value).toBe('1 Main St, Springfield, MO');
    expect(container.querySelector<HTMLInputElement>('#customerName')!.value).toBe('Jane Doe');
    expect(container.querySelector<HTMLSelectElement>('#plan')!.value).toBe('tfiber-1gig');
    expect(container.querySelector<HTMLInputElement>('#saleDate')!.value).toBe('2026-10-06');

    const setValue = (selector: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => {
      setValue('#orderNumberOrBtn', 'ORD-1');
      setValue('#installDate', '2026-10-20');
    });
    await act(async () => {
      container.querySelector<HTMLFormElement>('#rep-log-sale')!.requestSubmit();
    });

    expect(createSale).toHaveBeenCalledTimes(1);
    expect(createSale.mock.calls[0][0]).toMatchObject({
      draftId: 'r1_sold-1',
      customerAddress: '1 Main St, Springfield, MO',
      customerName: 'Jane Doe',
      saleDate: '2026-10-06',
      products: [expect.objectContaining({ productId: 'tfiber-1gig' })],
    });
  });

  it('dismisses a draft through the API and drops it from the list', async () => {
    await mount();
    await act(async () => button('Dismiss 1 Main St, Springfield, MO')!.click());
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/sales/drafts/r1_sold-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-1' },
    });
    expect(container.querySelector('[aria-labelledby="finish-h"]')).toBeNull();
  });
});
