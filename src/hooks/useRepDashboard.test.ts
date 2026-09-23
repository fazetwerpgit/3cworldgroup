import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sale } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));

import { fetchRepBook, withSaleInstallDate } from './useRepDashboard';

const SALE = { id: 's1', salesRepId: 'r1', status: 'approved', customerName: 'A', products: [] };

function stubFetch(status: { ok: boolean; body: unknown }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/portal/sales?')) {
      return new Response(JSON.stringify({ sales: [SALE] }), { status: 200 });
    }
    return new Response(JSON.stringify(status.body), { status: status.ok ? 200 : 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchRepBook', () => {
  it('flags a failed carrier report but keeps the book', async () => {
    stubFetch({ ok: false, body: { error: 'down' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const book = await fetchRepBook('r1', 'token', new AbortController().signal);
    expect(book.carrierFailed).toBe(true);
    expect(book.sales).toHaveLength(1);
    expect(book.fiberBySale.size).toBe(0);
  });

  it('is not flagged when the carrier report loads, even empty', async () => {
    stubFetch({ ok: true, body: { orders: [] } });
    const book = await fetchRepBook('r1', 'token', new AbortController().signal);
    expect(book.carrierFailed).toBe(false);
  });

  it('still fails outright when the sales themselves fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 })));
    await expect(fetchRepBook('r1', 'token', new AbortController().signal)).rejects.toThrow('nope');
  });
});

describe('withSaleInstallDate', () => {
  it('sets the saved date on that sale only and keeps the carrier map', () => {
    const fiberBySale = new Map();
    const book = {
      sales: [
        { id: 'a', installDate: new Date(2026, 8, 9, 12) },
        { id: 'b' },
      ] as Sale[],
      fiberBySale,
      carrierFailed: false,
    };

    const next = withSaleInstallDate(book, 'b', '2026-09-29T17:00:00.000Z');

    expect(next.sales[0]).toBe(book.sales[0]);
    expect(next.sales[1].installDate).toEqual(new Date('2026-09-29T17:00:00.000Z'));
    expect(next.fiberBySale).toBe(fiberBySale);
    expect(book.sales[1].installDate).toBeUndefined();
  });
});
