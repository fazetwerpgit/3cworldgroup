// @vitest-environment jsdom
//
// createSale on weak signal: a hung request gives up as "no signal" (the entry
// stays and the retry reuses its key), and a duplicate reply is passed on as a
// duplicate, never as a new sale.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));

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
});
