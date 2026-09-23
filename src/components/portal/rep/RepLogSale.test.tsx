// @vitest-environment jsdom
//
// Log Sale (D): a restored draft reopens on the details with its screenshots
// counted, a failed submit marks each bad field, and a manual entry asks for
// the order number.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSale = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
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
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => null }));

import { RepLogSale } from './RepLogSale';
import { DRAFT_KEY_PREFIX } from '@/hooks/useSaleFormState';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RepLogSale />));
}

beforeEach(() => {
  window.sessionStorage.clear();
  createSale.mockReset();
  push.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: null }), { status: 200 })));
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query }) as MediaQueryList);
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('RepLogSale', () => {
  it('reopens a draft on the details with its screenshots counted', async () => {
    window.sessionStorage.setItem(
      `${DRAFT_KEY_PREFIX}r1`,
      JSON.stringify({
        formData: {
          customerName: 'Alicia',
          customerAddress: '',
          proofScreenshotPaths: ['form-attachments/r1/sale-proof/a_000001/', 'form-attachments/r1/sale-proof/a_000002/'],
          proofScreenshotPath: 'form-attachments/r1/sale-proof/a_000001/',
        },
        products: [],
        saleDateTouched: false,
        proofUploadId: 'b'.repeat(32),
      })
    );
    await mount();
    expect(document.body.textContent).toContain('2 screenshots attached');
    expect(container.querySelector<HTMLInputElement>('#customerName')!.value).toBe('Alicia');
  });

  it('marks each missing field and asks for the order number on a manual entry', async () => {
    await mount();
    const manual = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Enter manually')
    )!;
    await act(async () => manual.click());
    const form = container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(createSale).not.toHaveBeenCalled();
    for (const id of ['plan', 'orderNumberOrBtn', 'customerAddress', 'installDate']) {
      const el = container.querySelector(`#${id}`)!;
      expect(el.getAttribute('aria-invalid')).toBe('true');
      expect(container.querySelector(`#${id}-error`)).not.toBeNull();
    }
    expect(container.querySelector('#orderNumberOrBtn-error')!.textContent).toMatch(/order number/i);
  });

  /** A complete manual entry, restored from a draft so no typing is needed. */
  async function mountFilled(saleDate: string) {
    window.sessionStorage.setItem(
      `${DRAFT_KEY_PREFIX}r1`,
      JSON.stringify({
        formData: {
          customerName: 'Carla Diaz',
          customerPhone: '',
          customerEmail: '',
          customerAddress: '1 Main St',
          saleType: 'new_service',
          saleDate,
          installDate: saleDate,
          notes: '',
          orderNumberOrBtn: 'TMF-1',
        },
        products: [
          { productId: 'tfiber-1gig', productName: 'TFiber 1 Gig', company: 'tfiber', quantity: 1, unitPrice: 0, totalPrice: 0, points: 0 },
        ],
        saleDateTouched: true,
        proofUploadId: 'c'.repeat(32),
      })
    );
    await mount();
  }

  async function submitForm() {
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('opens Sales on the month the sale was sold in', async () => {
    createSale.mockResolvedValue({ sale: { id: 'new-sale' }, duplicate: false });
    await mountFilled('2026-08-30');
    await submitForm();
    expect(push).toHaveBeenCalledWith('/portal/sales?logged=new-sale&month=2026-08');
  });

  it('says a duplicate was already logged and stays put', async () => {
    createSale.mockResolvedValue({
      sale: { id: 'd'.repeat(32), customerName: 'Carla Diaz', saleDate: '2026-08-30T17:00:00.000Z' },
      duplicate: true,
    });
    await mountFilled('2026-08-30');
    await submitForm();
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('This sale was already logged.');
    const view = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === 'View it')!;
    expect(view.getAttribute('href')).toBe(`/portal/sales/${'d'.repeat(32)}`);
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Log as a new sale')).toBe(true);
  });
});
