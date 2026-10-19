// @vitest-environment jsdom
//
// createSale on weak signal: a hung request gives up as "no signal" (the entry
// stays and the retry reuses its key), and a duplicate reply is passed on as a
// duplicate, never as a new sale.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));

import { getIdToken } from '@/lib/firebase/getIdToken';
import { NO_SIGNAL_SALE_MESSAGE, SALE_SUBMIT_TIMEOUT_MS, useSales } from './useSales';
import type { CreateSaleData } from '@/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const latest: { current: ReturnType<typeof useSales> | null } = { current: null };

function Harness() {
  const sales = useSales();
  useEffect(() => {
    latest.current = sales;
  });
  return null;
}

const saleData = { customerAddress: '1 Main St', clientSaleId: 'a'.repeat(32) } as unknown as CreateSaleData;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSales.createSale', () => {
  it('gives up on a hung submit as no signal', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    let result: unknown = 'pending';
    await act(async () => {
      const pending = latest.current!.createSale(saleData).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(SALE_SUBMIT_TIMEOUT_MS - 1);
      expect(result).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      await pending;
    });
    expect(result).toBeNull();
    expect(latest.current!.error).toBe(NO_SIGNAL_SALE_MESSAGE);
    expect(latest.current!.loading).toBe(false);
  });

  it('passes a duplicate reply on as a duplicate', async () => {
    const stored = { id: 'a'.repeat(32), customerName: 'Carla Diaz' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true, duplicate: true, sale: stored }), { status: 200 }))
    );
    let result: unknown;
    await act(async () => {
      result = await latest.current!.createSale(saleData);
    });
    expect(result).toEqual({ sale: stored, duplicate: true });
  });

  it('reports a new sale as not a duplicate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true, sale: { id: 'x' } }), { status: 200 }))
    );
    let result: unknown;
    await act(async () => {
      result = await latest.current!.createSale(saleData);
    });
    expect(result).toEqual({ sale: { id: 'x' }, duplicate: false });
  });

  it('passes an order-number clash on as orderDuplicate, not as an error', async () => {
    const body = {
      error: 'This order number was already logged',
      duplicateOrder: true,
      existingSaleId: null,
      existingRepName: 'Dana W.',
      existingSaleDate: '2026-09-14T17:00:00.000Z',
      existingCustomerFirstName: 'Maria',
      existingIsMine: false,
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 409 })));
    let result: unknown;
    await act(async () => {
      result = await latest.current!.createSale(saleData);
    });
    expect(result).toEqual({
      orderDuplicate: {
        existingSaleId: null,
        existingRepName: 'Dana W.',
        existingSaleDate: '2026-09-14T17:00:00.000Z',
        existingCustomerFirstName: 'Maria',
        existingIsMine: false,
      },
    });
    expect(latest.current!.error).toBeNull();
  });

  it('still reports a sale-id 409 as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Sale id already in use' }), { status: 409 }))
    );
    let result: unknown;
    await act(async () => {
      result = await latest.current!.createSale(saleData);
    });
    expect(result).toBeNull();
    expect(latest.current!.error).toBe('Sale id already in use');
  });

  it('shows no signal when the token refresh cannot reach Firebase', async () => {
    vi.mocked(getIdToken).mockRejectedValueOnce(new Error('Firebase: Error (auth/network-request-failed).'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let result: unknown;
    await act(async () => {
      result = await latest.current!.createSale(saleData);
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(latest.current!.error).toBe(NO_SIGNAL_SALE_MESSAGE);
  });

  it('counts a hung token refresh against the submit timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(getIdToken).mockImplementationOnce(() => new Promise<string | null>(() => {}));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let result: unknown = 'pending';
    await act(async () => {
      const pending = latest.current!.createSale(saleData).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(SALE_SUBMIT_TIMEOUT_MS);
      await pending;
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(latest.current!.error).toBe(NO_SIGNAL_SALE_MESSAGE);
    expect(latest.current!.loading).toBe(false);
  });
});

describe('useSales.fetchSales', () => {
  it('keeps the newest filters when an older request answers last', async () => {
    const answers: Array<(sales: unknown[]) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answers.push((sales) => resolve(new Response(JSON.stringify({ sales, truncated: false }), { status: 200 })));
          })
      )
    );
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = latest.current!.fetchSales({ limit: 500, salesRepId: 'me' });
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      second = latest.current!.fetchSales({ limit: 500 });
      await vi.waitFor(() => expect(answers).toHaveLength(2));
    });
    await act(async () => {
      answers[1]([{ id: 'mine' }, { id: 'theirs' }]);
      await second;
    });
    expect(latest.current!.loading).toBe(false);
    await act(async () => {
      answers[0]([{ id: 'mine' }]);
      await first;
    });
    expect(latest.current!.sales.map((s) => s.id)).toEqual(['mine', 'theirs']);
    expect(latest.current!.loading).toBe(false);
  });
});
